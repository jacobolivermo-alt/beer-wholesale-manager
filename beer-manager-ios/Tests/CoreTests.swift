import Foundation

@main struct CoreTests {
  static func main() throws {
    let folder = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(
      "beer-core-" + uid())
    defer { try? FileManager.default.removeItem(at: folder) }
    let url = folder.appendingPathComponent("db.json")
    let r = try Repository(url: url)
    var checks = 0
    func check(_ name: String, _ action: () throws -> Void) throws {
      try action()
      checks += 1
      print("✓ " + name)
    }
    func assert(_ value: Bool, _ message: String = "断言失败") throws {
      if !value { throw BusinessError.message(message) }
    }
    func rejects(_ action: () throws -> Void) throws {
      var rejected = false
      do { try action() } catch { rejected = true }
      try assert(rejected, "应拒绝非法操作")
    }
    func atomic(_ action: () throws -> Void) throws {
      let before = r.database
      try rejects(action)
      try assert(r.database == before)
    }
    let line = OrderLine(productId: "p-u8", name: "燕京 U8", cases: 10, price: 7200, caseSize: 24)
    try check("首次准确初始化且重新加载不重置") {
      try assert(r.database.products[0].stock == 82 && r.database.customers[0].receivable == 342000)
      try assert(try Repository(url: url).database == r.database)
    }
    try check("赊账送10箱：仓库72、酒吧22、应收4140、待回672") {
      try r.deliver(customerId: "c-old", lines: [line], paid: false, agreed: nil, reason: "")
      try assert(
        r.database.products[0].stock == 72 && r.database.stocks[0].cases == 22
          && r.database.customers[0].receivable == 414000
          && r.database.customers[0].bottleTotal == 672)
      try assert(r.database.records[0].amount == 72000)
    }
    try check("分类回瓶12瓶：库存21箱12瓶、待回660，欠款不变") {
      try r.returnBottles(customerId: "c-old", productId: "p-u8", count: 12, deduct: true)
      try assert(
        r.database.stocks[0].cases == 21 && r.database.stocks[0].loose == 12
          && r.database.customers[0].bottleTotal == 660
          && r.database.customers[0].receivable == 414000)
    }
    try check("收款1000：欠款3140，今日指标同步") {
      try r.payment(customerId: "c-old", amount: 100000, forgiven: 0, method: "微信", reason: "")
      try assert(r.database.customers[0].receivable == 314000)
      let s = AnalysisService.summary(
        r.database,
        interval: DateInterval(
          start: Date().addingTimeInterval(-86400), end: Date().addingTimeInterval(86400)))
      try assert(s.cases == 10 && s.collected == 100000 && s.bottles == 12)
    }
    try check("独立Repository重新读盘，业务完整保留") {
      try assert(try Repository(url: url).database == r.database)
    }
    try check("库存不足、零数量、非法价格和空客户不部分写入") {
      try atomic {
        try r.deliver(
          customerId: "c-old",
          lines: [OrderLine(productId: "p-u8", name: "U8", cases: 1000, price: 7200, caseSize: 24)],
          paid: false, agreed: nil, reason: "")
      }
      try atomic {
        try r.deliver(customerId: "", lines: [line], paid: false, agreed: nil, reason: "")
      }
      try atomic {
        try r.deliver(customerId: "c-old", lines: [], paid: false, agreed: nil, reason: "")
      }
    }
    try check("不能借用别种待回余额，估算不扣成负库存") {
      try atomic {
        try r.returnBottles(customerId: "c-old", productId: "p-pure", count: 1, deduct: true)
      }
      try atomic {
        try r.returnBottles(customerId: "c-old", productId: unclassified, count: 1, deduct: true)
      }
    }
    try check("旧余额分类总量不变，关闭估算只扣空瓶") {
      let before = r.database.customers[0].bottleTotal
      let stock = r.database.stocks[0]
      try r.classify(customerId: "c-old", productId: "p-u8", count: 24)
      try assert(r.database.customers[0].bottleTotal == before)
      try r.returnBottles(customerId: "c-old", productId: "p-u8", count: 24, deduct: false)
      try assert(r.database.stocks[0] == stock)
    }
    try check("协商货款保存原金额，已付款只计一次实收") {
      let debt = r.database.customers[0].receivable
      let small = OrderLine(productId: "p-u8", name: "U8", cases: 1, price: 7200, caseSize: 12)
      try r.deliver(customerId: "c-old", lines: [small], paid: true, agreed: 7000, reason: "优惠")
      try assert(
        r.database.customers[0].receivable == debt && r.database.records[0].collected == 7000
          && r.database.records[0].calculated == 7200)
      try assert(r.database.stocks[0].bottles == 528)
    }
    try check("实收加减免结清，应收超额拦截") {
      try atomic {
        try r.payment(customerId: "c-old", amount: 500000, forgiven: 0, method: "微信", reason: "")
      }
      try r.payment(
        customerId: "c-old", amount: 310000, forgiven: 4000, method: "现金", reason: "协商结清")
      try assert(
        r.database.customers[0].receivable == 0 && r.database.records[0].collected == 310000)
    }
    try check("进货与整箱加散瓶盘点，流水差额准确") {
      try r.purchase(productId: "p-u8", count: 50)
      try assert(r.database.products[0].stock == 121)
      try r.stocktake(productId: "p-u8", cases: 3, loose: 5, customerId: "c-old")
      try assert(r.database.stocks[0].bottles == 77 && r.database.records[0].quantity == -451)
      try atomic { try r.stocktake(productId: "p-u8", cases: 3, loose: 24, customerId: "c-old") }
    }
    try check("金额按分解析，负值与小数数量拒绝") {
      try assert(try parseMoney("12.35") == 1235)
      try assert(try parseMoney("0") == 0)
      try rejects { _ = try parseMoney("-1") }
      try rejects { _ = try parseQuantity("1.5") }
    }
    try check("未结清空瓶不能删除酒吧") { try atomic { try r.deleteCustomer("c-old") } }
    try check("收据备份恢复完整，超限不部分提交") {
      let id = r.database.records[0].id
      try r.attach(recordId: id, images: [Data([1, 2, 3])])
      let backup = try r.export()
      let restored = try Repository(
        recovering: JSONDecoder().decode(Database.self, from: backup),
        url: folder.appendingPathComponent("restored.json"))
      try assert(restored.database.records[0].receipts[0].image == Data([1, 2, 3]))
      try atomic {
        try r.attach(recordId: id, images: [Data(repeating: 0, count: 6 * 1024 * 1024)])
      }
    }
    try check("自然周与自然月跨年边界") {
      var cal = Calendar(identifier: .gregorian)
      cal.timeZone = TimeZone(secondsFromGMT: 0)!
      let now = ISO8601DateFormatter().date(from: "2026-01-01T12:00:00Z")!
      let week = AnalysisService.range(.week, offset: 0, now: now, calendar: cal)
      let month = AnalysisService.range(.month, offset: -1, now: now, calendar: cal)
      try assert(
        cal.component(.weekday, from: week.start) == 2
          && cal.component(.year, from: week.start) == 2025
          && cal.component(.month, from: month.start) == 12)
    }
    try check("损坏文件不自动覆盖") {
      let bad = folder.appendingPathComponent("bad.json")
      try Data("broken".utf8).write(to: bad)
      try rejects { _ = try Repository(url: bad) }
      try assert(try String(contentsOf: bad, encoding: .utf8) == "broken")
    }
    let extra = Product(name: "商品删除测试", price: 6000, stock: 0)
    try check("新增、删除、恢复商品保留ID与历史") {
      try r.saveProduct(extra); try r.deleteProduct(extra.id)
      try assert(r.database.products.first { $0.id == extra.id }?.deletedAt != nil)
      try atomic { try r.purchase(productId: extra.id, count: 1) }
      try r.restoreProduct(extra.id)
      try assert(r.database.products.first { $0.id == extra.id }?.deletedAt == nil)
    }
    try check("仓库库存未处理不能删除商品") { try atomic { try r.deleteProduct("p-u8") } }
    try check("酒吧散瓶库存与对应空瓶均保护删除") {
      try r.stocktake(productId: extra.id, cases: 0, loose: 1, customerId: "c-old")
      try atomic { try r.deleteProduct(extra.id) }
      try r.stocktake(productId: extra.id, cases: 0, loose: 0, customerId: "c-old")
      try r.purchase(productId: extra.id, count: 1)
      try r.deliver(customerId: "c-old", lines: [OrderLine(productId: extra.id, name: extra.name, cases: 1, price: extra.price, caseSize: 24)], paid: true, agreed: nil, reason: "")
      try r.stocktake(productId: extra.id, cases: 0, loose: 0, customerId: "c-old")
      try atomic { try r.deleteProduct(extra.id) }
      try r.returnBottles(customerId: "c-old", productId: extra.id, count: 24, deduct: false)
      let old = r.database.records
      try r.deleteProduct(extra.id)
      try assert(r.database.records == old)
    }
    try check("同名商品恢复冲突与持久化") {
      var other = Product(name: extra.name, price: 6500, stock: 0)
      try r.saveProduct(other); try atomic { try r.restoreProduct(extra.id) }
      other.name = "另一个商品"; try r.saveProduct(other); try r.restoreProduct(extra.id)
      try r.deleteProduct(extra.id)
      try assert(try Repository(url: url).database.products.first { $0.id == extra.id }?.deletedAt != nil)
    }
    try check("旧版商品JSON缺少删除字段仍可读取") {
      let encoded = try r.export()
      guard var object = try JSONSerialization.jsonObject(with: encoded) as? [String: Any], var products = object["products"] as? [[String: Any]] else { throw BusinessError.message("测试备份格式异常") }
      for i in products.indices { products[i].removeValue(forKey: "deletedAt") }
      object["products"] = products
      let decoded = try JSONDecoder().decode(Database.self, from: JSONSerialization.data(withJSONObject: object))
      try assert(decoded.products.allSatisfy { $0.deletedAt == nil })
    }
    print("\n\(checks) 个原生 iOS 业务场景通过")
  }
}
