import Foundation

/// 整份快照先验证、落盘成功后发布，失败不修改内存。
final class Repository {
  private(set) var database: Database
  let url: URL
  init(url: URL) throws {
    self.url = url
    if FileManager.default.fileExists(atPath: url.path) {
      database = try JSONDecoder().decode(Database.self, from: Data(contentsOf: url))
      try Self.validate(database)
    } else {
      database = Database.seed()
      try persist(database)
    }
  }
  init(recovering database: Database, url: URL) throws {
    try Self.validate(database)
    self.url = url
    self.database = database
    try persist(database)
  }
  private func persist(_ d: Database) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try encoder.encode(d).write(to: url, options: .atomic)
  }
  func transaction(_ change: (inout Database) throws -> Void) throws {
    var draft = database
    try change(&draft)
    try Self.validate(draft)
    try persist(draft)
    database = draft
  }
  static func validate(_ d: Database) throws {
    func require(_ condition: Bool) throws {
      if !condition { throw BusinessError.message("数据格式异常，未覆盖已有数据") }
    }
    try require(d.version == 1)
    try require(
      Set(d.products.map(\.id)).count == d.products.count
        && Set(d.customers.map(\.id)).count == d.customers.count
        && Set(d.records.map(\.id)).count == d.records.count)
    let productIds = Set(d.products.map(\.id))
    let customerIds = Set(d.customers.map(\.id))
    try require(Set(d.stocks.map { $0.customerId + ":" + $0.productId }).count == d.stocks.count)
    for p in d.products {
      try require(
        !p.name.trimmingCharacters(in: .whitespaces).isEmpty && p.stock >= 0 && p.stock <= 999999
          && p.price >= 0 && p.price <= 9_999_999_900 && p.threshold >= 0 && p.bottlesPerCase > 0
          && p.bottlesPerCase <= 999999)
    }
    for c in d.customers {
      try require(
        !c.name.trimmingCharacters(in: .whitespaces).isEmpty && c.receivable >= 0
          && c.receivable <= 9_999_999_900
          && c.bottles.allSatisfy {
            $0.value >= 0 && (productIds.contains($0.key) || $0.key == unclassified)
          }
          && c.prices.allSatisfy {
            productIds.contains($0.key) && $0.value >= 0 && $0.value <= 9_999_999_900
          })
    }
    for s in d.stocks {
      try require(
        productIds.contains(s.productId) && customerIds.contains(s.customerId) && s.bottles >= 0
          && s.bottles <= 999999 * 999999 && s.caseSize > 0 && s.caseSize <= 999999)
    }
    for r in d.records {
      try require(
        r.amount >= 0 && r.collected >= 0 && r.reduction >= 0
          && (r.customerId == nil || customerIds.contains(r.customerId!)) && r.receipts.count <= 6
          && r.receipts.allSatisfy { $0.image.count <= 5 * 1024 * 1024 })
    }
  }
  private static func product(_ d: Database, _ id: String) throws -> Int {
    guard let i = d.products.firstIndex(where: { $0.id == id && $0.deletedAt == nil }) else {
      throw BusinessError.message("请选择商品")
    }
    return i
  }
  private static func customer(_ d: Database, _ id: String) throws -> Int {
    guard let i = d.customers.firstIndex(where: { $0.id == id && !$0.deleted }) else {
      throw BusinessError.message("请选择酒吧")
    }
    return i
  }
  static func quote(_ d: Database, customerId: String, lines: [OrderLine]) throws -> Int {
    _ = try customer(d, customerId)
    guard !lines.isEmpty else { throw BusinessError.message("送货数量不能为 0") }
    guard Set(lines.map(\.productId)).count == lines.count else {
      throw BusinessError.message("商品不能重复")
    }
    for line in lines {
      let i = try product(d, line.productId)
      guard
        line.cases > 0 && line.cases <= 999999 && line.price >= 0 && line.price <= 9_999_999_900
          && line.caseSize > 0 && line.caseSize <= 999999
      else { throw BusinessError.message("请检查数量、价格和包装规格") }
      guard d.products[i].stock >= line.cases else {
        throw BusinessError.message("\(d.products[i].name) 库存不足")
      }
    }
    var total = 0
    for line in lines {
      guard line.amount <= 9_999_999_900 - total else { throw BusinessError.message("货款超过允许金额") }
      total += line.amount
    }
    guard total <= 9_999_999_900 else { throw BusinessError.message("货款超过允许金额") }
    return total
  }
  func deliver(customerId: String, lines: [OrderLine], paid: Bool, agreed: Int?, reason: String)
    throws
  {
    try transaction { d in
      let original = try Self.quote(d, customerId: customerId, lines: lines)
      let amount = agreed ?? original
      guard amount >= 0 && amount <= 9_999_999_900 else {
        throw BusinessError.message("货款不能为负数或超出上限")
      }
      guard amount == original || !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      else { throw BusinessError.message("修改货款请填写协商说明") }
      let c = try Self.customer(d, customerId)
      for line in lines {
        let p = try Self.product(d, line.productId)
        d.products[p].stock -= line.cases
        if let s = d.stocks.firstIndex(where: {
          $0.customerId == customerId && $0.productId == line.productId
        }) {
          d.stocks[s].bottles += line.bottles
        } else {
          d.stocks.append(
            CustomerStock(
              customerId: customerId, productId: line.productId, bottles: line.bottles,
              caseSize: d.products[p].bottlesPerCase))
        }
        d.customers[c].bottles[line.productId, default: 0] += line.bottles
      }
      if !paid { d.customers[c].receivable += amount }
      d.customers[c].lastUsed = Date()
      let details =
        lines.map { "\($0.name) × \($0.cases) 箱 · ¥\(currency($0.price))/箱 · \($0.caseSize)瓶/箱" }
        .joined(separator: "\n") + "\n" + (paid ? "已付款" : "赊账")
      d.records.insert(
        BusinessRecord(
          kind: .delivery, customerId: customerId, customerName: d.customers[c].name,
          details: details, amount: amount, collected: paid ? amount : 0,
          quantity: lines.reduce(0) { $0 + $1.cases }, calculated: original, reason: reason,
          lines: lines), at: 0)
    }
  }
  func returnBottles(customerId: String, productId: String, count: Int, deduct: Bool) throws {
    try transaction { d in
      let c = try Self.customer(d, customerId)
      guard count > 0 && count <= (d.customers[c].bottles[productId] ?? 0) else {
        throw BusinessError.message("回瓶数量须大于 0，且不能超过该种类待回数")
      }
      let name =
        productId == unclassified ? "历史未分类空瓶" : d.products[try Self.product(d, productId)].name
      if deduct {
        guard productId != unclassified else { throw BusinessError.message("未分类空瓶须先分类，才能扣对应库存") }
        guard
          let s = d.stocks.firstIndex(where: {
            $0.customerId == customerId && $0.productId == productId
          }), d.stocks[s].bottles >= count
        else { throw BusinessError.message("该商品库存不足扣减；若已盘点扣除，请关闭库存估算") }
        d.stocks[s].bottles -= count
      }
      d.customers[c].bottles[productId, default: 0] -= count
      d.customers[c].lastUsed = Date()
      d.records.insert(
        BusinessRecord(
          kind: .bottleReturn, customerId: customerId, customerName: d.customers[c].name,
          details: name + (deduct ? "\n已按回瓶扣减库存" : "\n仅回收空瓶，未扣库存"), quantity: count, unit: "瓶"),
        at: 0)
    }
  }
  func classify(customerId: String, productId: String, count: Int) throws {
    try transaction { d in
      let c = try Self.customer(d, customerId)
      let p = try Self.product(d, productId)
      guard count > 0 && count <= (d.customers[c].bottles[unclassified] ?? 0) else {
        throw BusinessError.message("分类数量不能超过未分类余额")
      }
      d.customers[c].bottles[unclassified, default: 0] -= count
      d.customers[c].bottles[productId, default: 0] += count
      d.records.insert(
        BusinessRecord(
          kind: .stocktake, customerId: customerId, customerName: d.customers[c].name,
          details: "空瓶分类：\(d.products[p].name) \(count) 瓶；总待回不变", unit: "瓶"), at: 0)
    }
  }
  func payment(customerId: String, amount: Int, forgiven: Int, method: String, reason: String)
    throws
  {
    try transaction { d in
      let c = try Self.customer(d, customerId)
      guard amount > 0 && forgiven >= 0 && amount <= 9_999_999_900 && forgiven <= 9_999_999_900
      else { throw BusinessError.message("实收须大于 0，减免不能为负") }
      guard amount + forgiven <= d.customers[c].receivable else {
        throw BusinessError.message("收款加减免不能超过当前应收")
      }
      guard forgiven == 0 || !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw BusinessError.message("减免请填写协商说明")
      }
      d.customers[c].receivable -= amount + forgiven
      d.customers[c].lastUsed = Date()
      d.records.insert(
        BusinessRecord(
          kind: .payment, customerId: customerId, customerName: d.customers[c].name,
          details: "\(method) · 实收 ¥\(currency(amount))\n减免 ¥\(currency(forgiven))", amount: amount,
          collected: amount, unit: "元", reduction: forgiven, reason: reason), at: 0)
    }
  }
  func purchase(productId: String, count: Int) throws {
    try transaction { d in
      let p = try Self.product(d, productId)
      guard count > 0 && count <= 999999 else { throw BusinessError.message("进货数量须大于 0") }
      d.products[p].stock += count
      d.records.insert(
        BusinessRecord(kind: .purchase, details: d.products[p].name, quantity: count), at: 0)
    }
  }
  func stocktake(productId: String, cases: Int, loose: Int, customerId: String?) throws {
    try transaction { d in
      let p = try Self.product(d, productId)
      guard cases >= 0 && cases <= 999999 && loose >= 0 else {
        throw BusinessError.message("库存不能为负")
      }
      if let customerId {
        let c = try Self.customer(d, customerId)
        let old = d.stocks.first(where: { $0.customerId == customerId && $0.productId == productId }
        )
        let size = old?.caseSize ?? d.products[p].bottlesPerCase
        guard loose < size else { throw BusinessError.message("散瓶必须少于 \(size) 瓶，请换算整箱") }
        let actual = cases * size + loose
        let before = old?.bottles ?? 0
        if let s = d.stocks.firstIndex(where: { $0.id == old?.id }) {
          d.stocks[s].bottles = actual
        } else {
          d.stocks.append(
            CustomerStock(
              customerId: customerId, productId: productId, bottles: actual, caseSize: size))
        }
        d.customers[c].lastUsed = Date()
        d.records.insert(
          BusinessRecord(
            kind: .stocktake, customerId: customerId, customerName: d.customers[c].name,
            details: "\(d.products[p].name)：\(before) → \(actual) 瓶", quantity: actual - before,
            unit: "瓶"), at: 0)
      } else {
        guard loose == 0 else { throw BusinessError.message("仓库按整箱盘点") }
        let before = d.products[p].stock
        d.products[p].stock = cases
        d.records.insert(
          BusinessRecord(
            kind: .stocktake, details: "\(d.products[p].name)：\(before) → \(cases) 箱",
            quantity: cases - before), at: 0)
      }
    }
  }
  func saveProduct(_ p: Product) throws {
    try transaction { d in
      guard !d.products.contains(where: { $0.deletedAt == nil && $0.id != p.id && $0.name == p.name }) else {
        throw BusinessError.message("商品名称已存在")
      }
      if let i = d.products.firstIndex(where: { $0.id == p.id }) {
        guard d.products[i].deletedAt == nil && p.deletedAt == nil else { throw BusinessError.message("请先恢复已删除商品") }
        let before = d.products[i].stock
        d.products[i] = p
        if before != p.stock {
          d.records.insert(
            BusinessRecord(
              kind: .stocktake, details: "\(p.name)：\(before) → \(p.stock) 箱",
              quantity: p.stock - before), at: 0)
        }
      } else {
        d.products.append(p)
      }
    }
  }
  func deleteProduct(_ id: String) throws {
    try transaction { d in
      let i = try Self.product(d, id)
      guard d.products[i].stock == 0 else { throw BusinessError.message("仓库仍有该商品库存，请先处理后再删除") }
      let active = Set(d.customers.filter { !$0.deleted }.map(\.id))
      guard !d.stocks.contains(where: { $0.productId == id && active.contains($0.customerId) && $0.bottles > 0 }) else {
        throw BusinessError.message("酒吧仍有该商品库存，请先盘点或处理后再删除")
      }
      guard !d.customers.contains(where: { !$0.deleted && ($0.bottles[id] ?? 0) > 0 }) else {
        throw BusinessError.message("该商品仍有待回空瓶，请先回收后再删除")
      }
      d.products[i].deletedAt = ISO8601DateFormatter().string(from: Date())
    }
  }
  func restoreProduct(_ id: String) throws {
    try transaction { d in
      guard let i = d.products.firstIndex(where: { $0.id == id && $0.deletedAt != nil }) else {
        throw BusinessError.message("找不到已删除商品")
      }
      guard !d.products.contains(where: { $0.deletedAt == nil && $0.id != id && $0.name == d.products[i].name }) else {
        throw BusinessError.message("已有同名商品，请先修改在用商品名称再恢复")
      }
      d.products[i].deletedAt = nil
    }
  }
  func saveCustomer(_ c: Customer) throws {
    try transaction { d in
      guard !d.customers.contains(where: { !$0.deleted && $0.id != c.id && $0.name == c.name })
      else { throw BusinessError.message("酒吧名称已存在") }
      if let i = d.customers.firstIndex(where: { $0.id == c.id && !$0.deleted }) {
        var updated = c
        updated.receivable = d.customers[i].receivable
        updated.bottles = d.customers[i].bottles
        updated.lastUsed = d.customers[i].lastUsed
        d.customers[i] = updated
      } else {
        d.customers.append(c)
      }
    }
  }
  func deleteCustomer(_ id: String) throws {
    try transaction { d in
      let c = try Self.customer(d, id)
      guard d.customers[c].receivable == 0 && d.customers[c].bottleTotal == 0 else {
        throw BusinessError.message("须先结清应收和待回空瓶，才能删除酒吧")
      }
      d.customers[c].deleted = true
    }
  }
  func attach(recordId: String, images: [Data]) throws {
    try transaction { d in
      guard let r = d.records.firstIndex(where: { $0.id == recordId }) else {
        throw BusinessError.message("找不到流水")
      }
      guard !images.isEmpty && d.records[r].receipts.count + images.count <= 6 else {
        throw BusinessError.message("每笔最多 6 张收据")
      }
      guard images.allSatisfy({ !$0.isEmpty && $0.count <= 5 * 1024 * 1024 }) else {
        throw BusinessError.message("单张图片不能超过 5MB")
      }
      d.records[r].receipts += images.map { Receipt(image: $0) }
    }
  }
  func removeReceipt(recordId: String, receiptId: String) throws {
    try transaction { d in
      guard let r = d.records.firstIndex(where: { $0.id == recordId }) else {
        throw BusinessError.message("找不到流水")
      }
      d.records[r].receipts.removeAll { $0.id == receiptId }
    }
  }
  func export() throws -> Data { try JSONEncoder().encode(database) }
  func restore(_ data: Data) throws {
    let imported = try JSONDecoder().decode(Database.self, from: data)
    try Self.validate(imported)
    try transaction { $0 = imported }
  }
  func reset(example: Bool) throws {
    try transaction {
      $0 =
        example
        ? .seed()
        : Database(
          products: Database.seed().products.map {
            var p = $0
            p.stock = 0
            return p
          })
    }
  }
}
