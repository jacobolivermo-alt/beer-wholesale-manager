import SwiftUI

struct ProductEditor: View {
  @EnvironmentObject var store: AppStore
  @Environment(\.dismiss) var dismiss
  var product: Product
  @LocalState<String> private var name = ""
  @LocalState<String> private var price = ""
  @LocalState<String> private var stock = "0"
  @LocalState<String> private var threshold = "15"
  @LocalState<String> private var size = "24"
  @LocalState<Review?> private var review: Review?
  @LocalState<String?> private var error: String?
  @LocalState<Bool> private var initialized = false
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 14) {
          Surface {
            SectionHeading(title: "商品资料")
            TextInput(label: "商品名称", text: $name)
            AmountField(label: "默认售价（元/箱）", text: $price)
            TextInput(label: "每箱瓶数", text: $size, placeholder: "24", keyboard: .numberPad)
            Text("包装变更只影响之后送货，历史记录与酒吧已有库存规格保持原值。")
              .font(.caption).foregroundStyle(.secondary)
          }
          Surface {
            SectionHeading(title: "仓库与提醒")
            CountControl(label: "仓库库存（箱）", text: $stock)
            TextInput(label: "低库存提醒值（箱）", text: $threshold, placeholder: "15", keyboard: .numberPad)
          }
        }.padding(16)
      }.appScreen().scrollDismissesKeyboard(.interactively)
        .navigationTitle(product.name.isEmpty ? "新增商品" : "编辑商品")
        .toolbar { Button("取消") { dismiss() } }
        .safeAreaInset(edge: .bottom) {
          MainButton(title: "核对保存", action: save).padding(16).background(.bar)
        }
        .onAppear {
          guard !initialized else { return }
          initialized = true
          name = product.name
          price = String(format: "%.2f", Double(product.price) / 100)
          stock = String(product.stock)
          threshold = String(product.threshold)
          size = String(product.bottlesPerCase)
        }.sheet(item: $review) { r in ReviewSheet(review: r) { dismiss() } }.businessError($error)
    }
  }
  private func save() {
    do {
      var p = product
      p.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
      p.price = try parseMoney(price)
      p.stock = try parseQuantity(stock)
      p.threshold = try parseQuantity(threshold)
      p.bottlesPerCase = try parseQuantity(size)
      guard !p.name.isEmpty && p.bottlesPerCase > 0 else {
        throw BusinessError.message("请填写名称与有效包装规格")
      }
      let saved = p
      review = Review(
        title: "保存商品",
        rows: [
          p.name, "¥\(currency(p.price))/箱 · \(p.bottlesPerCase) 瓶/箱",
          "仓库 \(p.stock) 箱；提醒值 \(p.threshold) 箱",
        ]
      ) {
        try store.run { try $0.saveProduct(saved) }
      }
    } catch { self.error = error.localizedDescription }
  }
}
struct CustomerEditor: View {
  @EnvironmentObject var store: AppStore
  @Environment(\.dismiss) var dismiss
  var customer: Customer
  @LocalState<String> private var name = ""
  @LocalState<String> private var contact = ""
  @LocalState<String> private var phone = ""
  @LocalState<String> private var address = ""
  @LocalState<String> private var remark = ""
  @LocalState<[String: String]> private var prices: [String: String] = [:]
  @LocalState<Review?> private var review: Review?
  @LocalState<String?> private var error: String?
  @LocalState<Bool> private var initialized = false
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 14) {
          Surface {
            SectionHeading(title: "酒吧资料")
            TextInput(label: "酒吧名称", text: $name)
            TextInput(label: "联系人", text: $contact, placeholder: "选填")
            TextInput(label: "电话", text: $phone, placeholder: "选填", keyboard: .phonePad)
            TextInput(label: "地址", text: $address, placeholder: "选填")
            TextInput(label: "备注", text: $remark, placeholder: "选填")
          }
          Surface {
            SectionHeading(title: "酒吧专属售价", subtitle: "留空使用默认价，送货时仍可临时修改")
            ForEach(store.products) { p in
              AmountField(
                label: "\(p.name) · 默认 ¥\(currency(p.price))/箱",
                text: Binding(get: { prices[p.id] ?? "" }, set: { prices[p.id] = $0 }),
                placeholder: "留空使用默认价")
            }
          }
          if store.customer(customer.id) != nil {
            Surface {
              SectionHeading(title: "删除酒吧", subtitle: "须先结清应收及待回瓶，历史流水保留")
              Button("删除这家酒吧", role: .destructive) {
                review = Review(title: "删除酒吧", rows: [customer.name, "须结清应收和待回瓶。删除后隐藏酒吧，历史流水保留。"]) {
                  try store.run { try $0.deleteCustomer(customer.id) }
                }
              }.font(.subheadline.weight(.semibold)).frame(minHeight: 44)
            }
          }
        }.padding(16)
      }.appScreen().scrollDismissesKeyboard(.interactively)
        .navigationTitle(customer.name.isEmpty ? "新增酒吧" : "编辑酒吧")
        .toolbar { Button("取消") { dismiss() } }
        .safeAreaInset(edge: .bottom) {
          MainButton(title: "核对保存", action: save).padding(16).background(.bar)
        }
        .onAppear {
          guard !initialized else { return }
          initialized = true
          name = customer.name
          contact = customer.contact
          phone = customer.phone
          address = customer.address
          remark = customer.remark
          prices = customer.prices.mapValues { String(format: "%.2f", Double($0) / 100) }
        }.sheet(item: $review) { r in ReviewSheet(review: r) { dismiss() } }.businessError($error)
    }
  }
  private func save() {
    do {
      var c = customer
      c.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
      c.contact = contact
      c.phone = phone
      c.address = address
      c.remark = remark
      guard !c.name.isEmpty else { throw BusinessError.message("请填写酒吧名称") }
      c.prices = try prices.filter {
        !$0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      }.mapValues { try parseMoney($0) }
      let saved = c
      review = Review(title: "保存酒吧", rows: [c.name, c.contact, c.address].filter { !$0.isEmpty }) {
        try store.run { try $0.saveCustomer(saved) }
      }
    } catch { self.error = error.localizedDescription }
  }
}
struct ManageProducts: View {
  @EnvironmentObject var store: AppStore
  @LocalState<Product?> private var edit: Product?
  @LocalState<Bool> private var showDeleted = false
  @LocalState<Review?> private var review: Review?
  var shown: [Product] { store.database.products.filter { showDeleted ? $0.deletedAt != nil : $0.deletedAt == nil } }
  var body: some View {
    ScrollView {
      LazyVStack(spacing: 12) {
        Picker("商品状态", selection: $showDeleted) {
          Text("在用商品").tag(false)
          Text("已删除").tag(true)
        }.pickerStyle(.segmented)
        ForEach(shown) { p in
          Surface {
            HStack(alignment: .firstTextBaseline) {
              Text(p.name).font(.headline)
              Spacer(minLength: 8)
              Text("¥\(currency(p.price))/箱").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.red)
            }
            Text("库存 \(p.stock) 箱 · \(p.bottlesPerCase) 瓶/箱").font(.subheadline).foregroundStyle(.secondary)
            HStack {
              if showDeleted {
                Button("恢复商品") {
                  review = Review(title: "恢复商品", rows: [p.name, "恢复后可再次进货、送货，历史单据保留。"] ) {
                    try store.run({ try $0.restoreProduct(p.id) }, success: "已恢复商品")
                  }
                }.frame(maxWidth: .infinity)
              } else {
                Button("编辑 / 调整库存") { edit = p }.frame(maxWidth: .infinity)
                Button("删除", role: .destructive) {
                  review = Review(title: "删除商品", rows: [p.name, "从业务选项移除，历史单据保留，可恢复。", "须先处理仓库、酒吧库存及该商品待回空瓶。"] ) {
                    try store.run({ try $0.deleteProduct(p.id) }, success: "已删除商品")
                  }
                }.frame(maxWidth: .infinity)
              }
            }.buttonStyle(.bordered).controlSize(.large)
          }
        }
        if shown.isEmpty {
          Surface { EmptyMessage(title: showDeleted ? "暂无已删除商品" : "暂无商品", message: "点右上角新增商品，填写售价与箱规。") }
        }
      }.padding(16)
    }.appScreen().navigationTitle("商品管理").toolbar {
      Button("新增") { edit = Product(name: "", price: 0, stock: 0) }
    }.sheet(item: $edit) { ProductEditor(product: $0) }
      .sheet(item: $review) { r in ReviewSheet(review: r) {} }
  }
}
struct ManageCustomers: View {
  @EnvironmentObject var store: AppStore
  @LocalState<Customer?> private var edit: Customer?
  var body: some View {
    ScrollView {
      LazyVStack(spacing: 12) {
        ForEach(store.customers) { c in
          Button {
            edit = c
          } label: {
            Surface {
              HStack {
                VStack(alignment: .leading, spacing: 6) {
                  Text(c.name).font(.headline)
                  Text(c.contact.isEmpty ? "联系人待补充" : c.contact).font(.caption).foregroundStyle(
                    .secondary)
                }
                Spacer()
                Text("编辑").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.red)
              }
            }
          }.buttonStyle(.plain).foregroundStyle(.primary)
        }
        if store.customers.isEmpty {
          Surface { EmptyMessage(title: "暂无酒吧", message: "点右上角新增，名称必填，其余资料可稍后补充。") }
        }
      }.padding(16)
    }.appScreen().navigationTitle("酒吧管理").toolbar { Button("新增") { edit = Customer(name: "") } }
      .sheet(item: $edit) { CustomerEditor(customer: $0) }
  }
}
struct SettingsView: View {
  @EnvironmentObject var store: AppStore
  @LocalState<Bool> private var export = false
  @LocalState<Bool> private var importing = false
  @LocalState<BackupDocument> private var document = BackupDocument(data: Data())
  @LocalState<Review?> private var review: Review?
  @LocalState<String?> private var error: String?
  var body: some View {
    List {
      if let loadError = store.loadError { Section { Text(loadError).foregroundStyle(Theme.red) } }
      Section {
        NavigationLink("经营分析") { AnalysisView() }
        NavigationLink("商品管理") { ManageProducts() }
        NavigationLink("酒吧管理") { ManageCustomers() }
      }
      Section("数据备份") {
        Button("导出完整备份（含收据）") {
          do {
            document = BackupDocument(data: try store.backup())
            export = true
          } catch { self.error = error.localizedDescription }
        }
        Button("从备份恢复") { importing = true }
        Text("数据保存在此 iPhone。建议定期导出到文件或 iCloud Drive；重新安装时保持相同 App 标识，并避免先删除 App。").font(.footnote)
          .foregroundStyle(.secondary)
      }
      Section("开始使用") {
        Button("清空示例，开始记真实业务", role: .destructive) {
          review = Review(
            title: "清空业务数据", rows: ["先导出备份。将清空酒吧、流水与收据，保留四款商品，仓库库存归零。", "此操作无法在 App 内撤销。"]
          ) { try store.run { try $0.reset(example: false) } }
        }
        Button("恢复示例数据", role: .destructive) {
          review = Review(title: "恢复示例", rows: ["现有业务和收据将被示例替换，请先导出备份。"]) {
            try store.run { try $0.reset(example: true) }
          }
        }
      }
      Section("关于") {
        Text("啤酒批发管家 · iPhone V1.4")
        Text("本地单人管理，无服务器、登录或微信依赖。首次为示例数据，小程序、原生 App 与网页 App 各自存储，暂不自动同步。").font(.footnote)
          .foregroundStyle(.secondary)
      }
    }.scrollContentBackground(.hidden).appScreen().navigationTitle("我的")
      .fileExporter(
        isPresented: $export, document: document, contentType: .json,
        defaultFilename: "啤酒管家备份-\(Date().formatted(.iso8601.year().month().day()))"
      ) { result in if case .failure(let e) = result { error = e.localizedDescription } }
      .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
        do {
          let url = try result.get()
          let access = url.startAccessingSecurityScopedResource()
          defer { if access { url.stopAccessingSecurityScopedResource() } }
          let data = try Data(contentsOf: url)
          let d = try JSONDecoder().decode(Database.self, from: data)
          try Repository.validate(d)
          review = Review(
            title: "恢复备份",
            rows: [
              "商品 \(d.products.count) 款、酒吧 \(d.customers.filter { !$0.deleted }.count) 家、流水 \(d.records.count) 条",
              "覆盖当前业务；请确认已导出当前备份。",
            ]
          ) { try store.restore(data) }
        } catch { self.error = error.localizedDescription }
      }
      .sheet(item: $review) { r in ReviewSheet(review: r) {} }.businessError($error)
  }
}
