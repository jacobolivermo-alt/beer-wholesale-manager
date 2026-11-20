import SwiftUI

struct LineDraft: Identifiable {
  var id: String
  var name: String
  var stock: Int
  var quantity = "0"
  var price: String
  var size: String
}
struct Review: Identifiable {
  let id = uid()
  var title: String
  var rows: [String]
  var save: () throws -> Void
}
struct ReviewSheet: View {
  var review: Review
  var finished: () -> Void
  @Environment(\.dismiss) private var dismiss
  @LocalState<String?> private var error: String?
  @LocalState<Bool> private var saving = false
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          SectionHeading(title: "核对这一笔", subtitle: "请核对以下内容，确认后执行本次操作")
          Surface {
            ForEach(Array(review.rows.enumerated()), id: \.offset) { index, row in
              Text(row).font(index == 0 ? .headline : .body)
                .foregroundStyle(index == 0 ? Color.primary : Color.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true).padding(.vertical, 4)
              if index < review.rows.count - 1 { Divider() }
            }
          }
        }.padding(16)
      }.appScreen().navigationTitle(review.title)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("返回修改") { dismiss() } } }
        .safeAreaInset(edge: .bottom) {
          MainButton(title: saving ? "正在保存…" : "确认保存") {
            guard !saving else { return }
            saving = true
            do {
              try review.save()
              dismiss()
              finished()
            } catch {
              self.error = error.localizedDescription
              saving = false
            }
          }.disabled(saving).padding(16).background(.bar)
        }.businessError($error)
    }.presentationDetents([.large])
  }
}
struct OperationView: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.dismiss) private var dismiss
  var route: OperationRoute
  @LocalState<String> private var customerId = ""
  @LocalState<String> private var productId = ""
  @LocalState<[LineDraft]> private var drafts: [LineDraft] = []
  @LocalState<String> private var count = "0"
  @LocalState<String> private var loose = "0"
  @LocalState<String> private var caseSize = "24"
  @LocalState<String> private var finalAmount = ""
  @LocalState<String> private var amount = ""
  @LocalState<String> private var forgiven = "0"
  @LocalState<String> private var reason = ""
  @LocalState<Bool> private var paid = false
  @LocalState<Bool> private var deduct = true
  @LocalState<Bool> private var warehouse = true
  @LocalState<String> private var method = "微信"
  @LocalState<Review?> private var review: Review?
  @LocalState<String?> private var error: String?
  @LocalState<Bool> private var initialized = false
  private var customer: Customer? { store.customer(customerId) }
  private var product: Product? { store.product(productId) }
  private var stock: CustomerStock? { store.stocks(customerId).first { $0.productId == productId } }
  private var quoted: Int {
    drafts.reduce(0) {
      $0 + ((try? parseQuantity($1.quantity)) ?? 0) * ((try? parseMoney($1.price)) ?? 0)
    }
  }
  private var total: Int { drafts.reduce(0) { $0 + ((try? parseQuantity($1.quantity)) ?? 0) } }
  private var bottleKinds: [(String, String)] {
    var kinds = store.products.filter { (customer?.bottles[$0.id] ?? 0) > 0 }.map {
      ($0.id, $0.name)
    }
    if (customer?.bottles[unclassified] ?? 0) > 0 { kinds.append((unclassified, "历史未分类空瓶")) }
    return kinds
  }
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          SectionHeading(title: operationTitle, subtitle: operationHint).padding(.vertical, 4)
          if route.kind == .stocktake {
            Surface {
              SectionHeading(title: "盘点位置")
              Picker("位置", selection: $warehouse) {
                Text("仓库").tag(true)
                Text("酒吧").tag(false)
              }.pickerStyle(.segmented)
            }
          }
          if route.kind != .purchase && !(route.kind == .stocktake && warehouse) {
            Surface {
              SectionHeading(title: "选择酒吧")
              Picker("酒吧", selection: $customerId) {
                Text("请选择").tag("")
                ForEach(store.customers) { Text($0.name).tag($0.id) }
              }.pickerStyle(.menu).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
              if store.customers.isEmpty {
                Text("先到酒吧页新增一家酒吧，再开始录入。").font(.subheadline).foregroundStyle(.secondary)
              }
            }
          }
          switch route.kind {
          case .delivery: deliveryFields
          case .bottleReturn: returnFields
          case .payment: paymentFields
          case .purchase, .stocktake: inventoryFields
          }
          if route.kind == .delivery || route.kind == .payment {
            Surface {
              TextInput(label: "协商说明", text: $reason, placeholder: "调整货款或减免时必填")
            }
          }
        }.padding(16)
      }
      .appScreen().scrollDismissesKeyboard(.interactively)
      .navigationTitle(route.kind.title)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
        ToolbarItemGroup(placement: .keyboard) {
          Spacer()
          Button("完成") {
            UIApplication.shared.sendAction(
              #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
          }
        }
      }
      .safeAreaInset(edge: .bottom) {
        VStack(spacing: 12) {
          if route.kind == .delivery {
            ViewThatFits(in: .horizontal) {
              HStack(alignment: .firstTextBaseline) {
                Text("共 \(total) 箱").font(.headline)
                Spacer()
                Text("¥\(currency((try? parseMoney(finalAmount)) ?? quoted))")
                  .font(.system(.title2, design: .rounded, weight: .bold)).foregroundStyle(
                    Theme.red
                  ).monospacedDigit()
              }
              VStack(alignment: .leading, spacing: 6) {
                Text("共 \(total) 箱").font(.headline)
                Text("¥\(currency((try? parseMoney(finalAmount)) ?? quoted))")
                  .font(.system(.title2, design: .rounded, weight: .bold)).foregroundStyle(
                    Theme.red
                  ).monospacedDigit()
              }
            }
          }
          MainButton(title: "核对并确认\(route.kind.title)", action: prepare)
        }.padding(16).background(.bar)
      }
      .onAppear { setup() }
      .onChange(of: customerId) { _, _ in changedCustomer() }
      .onChange(of: productId) { _, _ in changedProduct() }
      .onChange(of: warehouse) { _, _ in changedProduct() }
      .sheet(item: $review) { r in ReviewSheet(review: r) { dismiss() } }
      .businessError($error)
    }
  }
  private var operationTitle: String {
    switch route.kind {
    case .delivery: "把这次送的酒记下来"
    case .bottleReturn: "空瓶按种类、按瓶回收"
    case .payment: "实收与减免分开记清楚"
    case .purchase: "补充仓库库存"
    case .stocktake: "用实际库存校准系统"
    }
  }
  private var operationHint: String {
    switch route.kind {
    case .delivery: "可送多款商品，数量用箱，包装用瓶/箱。"
    case .bottleReturn: "支持散瓶；整箱可快捷换算。"
    case .payment: "协商少收的部分填在减免里，账才会结清。"
    case .purchase: "确认后增加库存并生成流水。"
    case .stocktake: "库存调整会留记录，应收和待回瓶保持原值。"
    }
  }
  private var deliveryFields: some View {
    Group {
      ForEach($drafts) { $line in
        Surface {
          HStack(alignment: .firstTextBaseline) {
            Text(line.name).font(.headline)
            Spacer(minLength: 8)
            Text("仓库 \(line.stock) 箱").font(.caption).foregroundStyle(.secondary)
          }
          Text("¥\(line.price)/箱 · \(line.size) 瓶/箱").font(.subheadline).foregroundStyle(.secondary)
          CountControl(label: "本次送货（箱）", text: $line.quantity)
          DisclosureGroup("调整本次售价 / 包装") {
            VStack(alignment: .leading, spacing: 14) {
              AmountField(label: "本次售价（元/箱）", text: $line.price)
              TextInput(
                label: "本次包装（瓶/箱）", text: $line.size, placeholder: "24", keyboard: .numberPad)
            }.padding(.top, 12)
          }.font(.subheadline).tint(Theme.red)
        }
      }
      Surface {
        SectionHeading(title: "货款与付款")
        HStack {
          Text("计算货款").font(.subheadline).foregroundStyle(.secondary)
          Spacer()
          Text("¥\(currency(quoted))").font(.headline).monospacedDigit()
        }
        AmountField(label: "协商后货款（留空按计算金额）", text: $finalAmount, placeholder: currency(quoted))
        Picker("付款状态", selection: $paid) {
          Text("赊账").tag(false)
          Text("已付款").tag(true)
        }.pickerStyle(.segmented)
        Text(paid ? "货款计入今日实收，不增加欠款。" : "货款计入该酒吧应收，之后收款结算。")
          .font(.caption).foregroundStyle(paid ? Theme.green : Theme.orange)
        Text("按每款本次瓶数增加对应待回空瓶。").font(.caption).foregroundStyle(.secondary)
      }
    }
  }
  private var returnFields: some View {
    Group {
      Surface {
        SectionHeading(title: "空瓶种类")
        Picker("种类", selection: $productId) {
          Text("请选择").tag("")
          ForEach(bottleKinds, id: \.0) { Text($0.1).tag($0.0) }
        }.pickerStyle(.menu).frame(minHeight: 44)
        Text("该种待回 \(customer?.bottles[productId] ?? 0) 瓶")
          .font(.system(.title3, design: .rounded, weight: .bold)).monospacedDigit()
        CountControl(label: "本次回收（瓶）", text: $count)
      }
      Surface {
        SectionHeading(title: "整箱快捷换算", subtitle: "本次统计仍按瓶保存")
        TextInput(label: "每箱瓶数", text: $caseSize, placeholder: "24", keyboard: .numberPad)
        Button("＋1 箱（\(caseSize) 瓶）") {
          do {
            let size = try parseQuantity(caseSize)
            guard size > 0 else { throw BusinessError.message("每箱瓶数须大于 0") }
            count = String(min(999999, min(999999, max(0, Int(count) ?? 0)) + size))
          } catch { self.error = error.localizedDescription }
        }.font(.headline).frame(maxWidth: .infinity, minHeight: 48)
          .background(Theme.background, in: RoundedRectangle(cornerRadius: 8)).buttonStyle(.plain)
          .foregroundStyle(Theme.red)
      }
      Surface {
        Toggle("根据回瓶扣减剩余库存", isOn: $deduct).disabled(productId == unclassified).tint(Theme.green)
        if let stock {
          Text("当前 \(stock.label) · \(stock.caseSize) 瓶/箱").font(.subheadline).foregroundStyle(
            .secondary)
          if let n = Int(count), n >= 0, n <= stock.bottles && deduct {
            let after = CustomerStock(
              customerId: customerId, productId: productId, bottles: stock.bottles - n,
              caseSize: stock.caseSize)
            Text("回瓶后预计 \(after.label)").font(.headline).foregroundStyle(Theme.green)
          }
        }
        Text(
          productId == unclassified
            ? "旧空瓶须先在酒吧详情分类，才能估算具体商品库存。" : "每回 1 瓶扣该商品 1 瓶。若已盘点扣除，请关闭此项；延迟回瓶或丢瓶会影响估算。"
        )
        .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }
    }
  }
  private var paymentFields: some View {
    Group {
      Surface {
        SectionHeading(title: "当前应收")
        Text("¥\(currency(customer?.receivable ?? 0))")
          .font(.system(.largeTitle, design: .rounded, weight: .bold)).monospacedDigit()
          .foregroundStyle(Theme.red)
      }
      Surface {
        SectionHeading(title: "本次收款")
        AmountField(label: "实际收到（元）", text: $amount)
        AmountField(label: "协商减免（元）", text: $forgiven)
        Text("例如应收 3420、实收 3400，填减免 20 才结清。").font(.caption).foregroundStyle(.secondary)
        Picker("支付方式", selection: $method) {
          ForEach(["微信", "支付宝", "现金", "银行卡"], id: \.self) { Text($0) }
        }.pickerStyle(.menu).frame(minHeight: 44)
      }
    }
  }
  private var inventoryFields: some View {
    Group {
      Surface {
        SectionHeading(title: "选择商品")
        Picker("商品", selection: $productId) {
          Text("请选择").tag("")
          ForEach(store.products) { Text($0.name).tag($0.id) }
        }.pickerStyle(.menu).frame(minHeight: 44)
        Text(
          warehouse || route.kind == .purchase
            ? "仓库现存 \(product?.stock ?? 0) 箱" : "系统库存 \(stock?.label ?? "0 箱")"
        )
        .font(.headline).monospacedDigit()
      }
      Surface {
        CountControl(label: route.kind == .purchase ? "进货数量（箱）" : "实际库存（箱）", text: $count)
        if route.kind == .stocktake && !warehouse {
          TextInput(label: "实际散瓶（瓶）", text: $loose, placeholder: "0", keyboard: .numberPad)
          Text("散瓶须少于 \(stock?.caseSize ?? product?.bottlesPerCase ?? 24) 瓶").font(.caption)
            .foregroundStyle(.secondary)
        }
        if route.kind == .stocktake {
          Text("盘点只校准库存，不改变应收和待回空瓶。").font(.caption).foregroundStyle(.secondary)
        }
      }
    }
  }
  private func setup() {
    guard !initialized else { return }
    initialized = true
    customerId = route.customerId
    warehouse = route.customerId.isEmpty
    productId = store.products.first?.id ?? ""
    changedCustomer()
    changedProduct()
  }
  private func changedCustomer() {
    drafts = store.products.map {
      LineDraft(
        id: $0.id, name: $0.name, stock: $0.stock,
        price: currency(customer?.prices[$0.id] ?? $0.price).replacingOccurrences(
          of: ",", with: ""), size: String($0.bottlesPerCase))
    }
    finalAmount = ""
    reason = ""
    count = "0"
    if route.kind == .bottleReturn {
      productId = bottleKinds.first?.0 ?? ""
      changedProduct()
    }
    if route.kind == .stocktake { changedProduct() }
  }
  private func changedProduct() {
    caseSize = String(product?.bottlesPerCase ?? 24)
    if route.kind == .bottleReturn {
      count = "0"
      deduct = productId != unclassified
    }
    if route.kind == .stocktake {
      count = String(warehouse ? (product?.stock ?? 0) : (stock?.cases ?? 0))
      loose = String(stock?.loose ?? 0)
    }
  }
  private func prepare() {
    do {
      let cId = customerId
      let pId = productId
      if route.kind != .purchase && !(route.kind == .stocktake && warehouse) && customer == nil {
        throw BusinessError.message("请选择酒吧")
      }
      var rows = [customer?.name ?? "仓库"]
      let action: (Repository) throws -> Void
      switch route.kind {
      case .delivery:
        let lines = try drafts.compactMap { draft -> OrderLine? in
          let n = try parseQuantity(draft.quantity)
          if n == 0 { return nil }
          return OrderLine(
            productId: draft.id, name: draft.name, cases: n, price: try parseMoney(draft.price),
            caseSize: try parseQuantity(draft.size))
        }
        let quote = try Repository.quote(store.database, customerId: cId, lines: lines)
        let agreed = finalAmount.isEmpty ? quote : try parseMoney(finalAmount)
        let isPaid = paid
        let note = reason
        if agreed != quote && note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          throw BusinessError.message("修改货款请填写协商说明")
        }
        rows += lines.map {
          "\($0.name) × \($0.cases) 箱\n¥\(currency($0.price))/箱 · \($0.caseSize) 瓶/箱"
        }
        rows += [
          "计算 ¥\(currency(quote)) → 最终 ¥\(currency(agreed))", isPaid ? "已付款，计入实收" : "赊账，增加应收",
          "新增待回 \(lines.reduce(0) { $0 + $1.bottles }) 瓶", note,
        ]
        action = {
          try $0.deliver(customerId: cId, lines: lines, paid: isPaid, agreed: agreed, reason: note)
        }
      case .bottleReturn:
        let n = try parseQuantity(count)
        let shouldDeduct = deduct
        guard n > 0 && n <= (customer?.bottles[pId] ?? 0) else {
          throw BusinessError.message("回瓶数量不能超过该种类待回数，且须大于 0")
        }
        if shouldDeduct && (stock == nil || n > (stock?.bottles ?? 0)) {
          throw BusinessError.message("酒吧剩余库存不足以扣减，请核对数量或关闭库存估算")
        }
        rows += [
          bottleKinds.first { $0.0 == pId }?.1 ?? "未选择", "回收 \(n) 瓶",
          shouldDeduct ? "同步扣减对应酒吧库存 \(n) 瓶" : "只回空瓶，不扣库存",
        ]
        action = {
          try $0.returnBottles(customerId: cId, productId: pId, count: n, deduct: shouldDeduct)
        }
      case .payment:
        let cash = try parseMoney(amount)
        let waiver = try parseMoney(forgiven)
        let note = reason
        let paymentMethod = method
        guard cash > 0 && cash + waiver <= (customer?.receivable ?? 0) else {
          throw BusinessError.message("实收须大于 0，实收加减免不能超过当前应收")
        }
        if waiver > 0 && note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          throw BusinessError.message("减免请填写协商说明")
        }
        rows += [
          "实收 ¥\(currency(cash)) · \(paymentMethod)", "减免 ¥\(currency(waiver))",
          "剩余应收 ¥\(currency((customer?.receivable ?? 0) - cash - waiver))", note,
        ]
        action = {
          try $0.payment(
            customerId: cId, amount: cash, forgiven: waiver, method: paymentMethod, reason: note)
        }
      case .purchase:
        let n = try parseQuantity(count)
        guard product != nil, n > 0 else { throw BusinessError.message("请选择商品，进货数量须大于 0") }
        rows = ["仓库", product?.name ?? "请选择商品", "进货 \(n) 箱"]
        action = { try $0.purchase(productId: pId, count: n) }
      case .stocktake:
        let n = try parseQuantity(count)
        let l = warehouse ? 0 : try parseQuantity(loose)
        let target: String? = warehouse ? nil : cId
        guard let product else { throw BusinessError.message("请选择商品") }
        if !warehouse && l >= (stock?.caseSize ?? product.bottlesPerCase) {
          throw BusinessError.message("散瓶数量须少于每箱瓶数，请先换算为整箱")
        }
        rows = [
          warehouse ? "仓库" : (customer?.name ?? "酒吧"), product.name,
          "实际 \(n) 箱" + (warehouse ? "" : "＋\(l) 瓶"), "仅调整库存，不改变欠款或待回空瓶",
        ]
        action = { try $0.stocktake(productId: pId, cases: n, loose: l, customerId: target) }
      }
      review = Review(
        title: "确认\(route.kind.title)", rows: rows.filter { !$0.isEmpty },
        save: { try store.run(action, success: "\(route.kind.title)成功") })
    } catch { self.error = error.localizedDescription }
  }
}
