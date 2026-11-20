import SwiftUI

struct RootView: View {
  @EnvironmentObject var store: AppStore
  var body: some View {
    TabView {
      NavigationStack { HomeView() }.tabItem { Label("首页", systemImage: "house") }
      NavigationStack { CustomersView() }.tabItem { Label("酒吧", systemImage: "building.2") }
      NavigationStack { EntryView() }.tabItem { Label("记一笔", systemImage: "plus.circle.fill") }
      NavigationStack { RecordsView(customerId: nil) }.tabItem {
        Label("记录", systemImage: "list.bullet.rectangle")
      }
      NavigationStack { SettingsView() }.tabItem { Label("我的", systemImage: "person.crop.circle") }
    }.tint(Theme.red)
      .overlay(alignment: .top) {
        if let notice = store.notice {
          Label(notice, systemImage: "checkmark.circle.fill").font(.subheadline.bold())
            .padding(.horizontal, 20).padding(.vertical, 13).foregroundStyle(.white)
            .background(Theme.green, in: Capsule()).padding(.top, 12)
            .task(id: notice) {
              try? await Task.sleep(for: .seconds(2))
              if store.notice == notice { store.notice = nil }
            }.allowsHitTesting(false)
        }
      }
  }
}
struct HomeView: View {
  @EnvironmentObject var store: AppStore
  @LocalState<OperationRoute?> private var route: OperationRoute?
  private var today: Summary {
    let cal = Calendar.current
    let start = cal.startOfDay(for: Date())
    return AnalysisService.summary(
      store.database,
      interval: DateInterval(start: start, end: cal.date(byAdding: .day, value: 1, to: start)!))
  }
  private var attention: [Customer] {
    store.customers.filter {
      $0.receivable > 0 || $0.bottleTotal >= 720
        || store.stocks($0.id).reduce(0, { $0 + $1.cases }) < 10
    }
  }
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        HStack(alignment: .bottom) {
          VStack(alignment: .leading, spacing: 5) {
            Text("今日生意").font(.system(.title, design: .rounded, weight: .bold))
            Text("酒、空瓶、钱，每一笔都清楚").font(.subheadline).foregroundStyle(.secondary)
          }
          Spacer(minLength: 8)
          Text(Date(), format: .dateTime.month().day()).font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
        }.padding(.top, 4)
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
          Metric(title: "今日送货", value: "\(today.cases) 箱")
          Metric(title: "今日收款", value: "¥\(currency(today.collected))", color: Theme.green)
          Metric(
            title: "当前应收", value: "¥\(currency(store.customers.reduce(0) { $0 + $1.receivable }))",
            color: Theme.red)
          Metric(title: "待回空瓶", value: "\(store.customers.reduce(0) { $0 + $1.bottleTotal }) 瓶")
        }
        MainButton(title: "＋ 记一笔送货") { route = OperationRoute(kind: .delivery) }
        NavigationLink {
          AnalysisView()
        } label: {
          HStack {
            Text("周 / 月经营统计").font(.subheadline.weight(.semibold))
            Spacer()
            Image(systemName: "chevron.right").font(.caption.weight(.semibold))
          }.foregroundStyle(Theme.red).padding(.vertical, 6)
        }
        Surface {
          HStack {
            SectionHeading(title: "仓库库存", subtitle: "单位：箱 · 低于提醒值会标注")
            Button("进货") { route = OperationRoute(kind: .purchase) }.font(
              .subheadline.weight(.semibold)
            ).frame(minHeight: 44)
          }
          ForEach(store.products) { p in
            HStack(alignment: .firstTextBaseline, spacing: 12) {
              VStack(alignment: .leading, spacing: 5) {
                Text(p.name).font(.subheadline.weight(.semibold))
                if p.stock < p.threshold {
                  Text("低库存 · 提醒值 \(p.threshold) 箱").font(.caption).foregroundStyle(Theme.orange)
                }
              }
              Spacer(minLength: 8)
              Text("\(p.stock)").font(.system(.title2, design: .rounded, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(p.stock < p.threshold ? Theme.orange : Color.primary)
              Text("箱").font(.caption).foregroundStyle(.secondary)
            }
            if p.id != store.products.last?.id { Divider() }
          }
          if store.products.isEmpty {
            EmptyMessage(title: "暂无商品", message: "到“我的”添加商品后即可进货和送货。")
          }
        }
        Surface {
          SectionHeading(title: "需要注意", subtitle: "欠款、待回空瓶及偏低的酒吧库存")
          ForEach(attention) { c in
            NavigationLink {
              CustomerDetail(id: c.id)
            } label: {
              HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 7) {
                  Text(c.name).font(.headline).foregroundStyle(.primary)
                  if c.receivable > 0 {
                    Text("欠款 ¥\(currency(c.receivable))").font(.subheadline.weight(.semibold))
                      .foregroundStyle(Theme.red)
                  }
                  if c.bottleTotal >= 720 {
                    Text("待回 \(c.bottleTotal) 瓶").font(.subheadline).foregroundStyle(Theme.orange)
                  }
                  if store.stocks(c.id).reduce(0, { $0 + $1.cases }) < 10 {
                    Text("酒吧库存偏低，建议核对").font(.caption).foregroundStyle(Theme.orange)
                  }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(
                  .tertiary
                ).padding(.top, 5)
              }.frame(maxWidth: .infinity, alignment: .leading)
            }.buttonStyle(.plain)
            if c.id != attention.last?.id { Divider() }
          }
          if attention.isEmpty { EmptyMessage(title: "目前一切正常", message: "有需要跟进的欠款、空瓶或库存时会显示在这里。") }
        }
      }.padding(16)
    }.appScreen().navigationTitle("啤酒批发管家").sheet(item: $route) { OperationView(route: $0) }
  }
}
struct CustomerCard: View {
  @EnvironmentObject var store: AppStore
  var customer: Customer
  private var stocks: [CustomerStock] { store.stocks(customer.id) }
  var body: some View {
    Surface {
      HStack(alignment: .firstTextBaseline) {
        Text(customer.name).font(.title3.bold()).foregroundStyle(.primary)
        Spacer(minLength: 8)
        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(
          .tertiary)
      }
      HStack(alignment: .top, spacing: 16) {
        VStack(alignment: .leading, spacing: 6) {
          Text("当前库存").font(.caption).foregroundStyle(.secondary)
          Text("\(stocks.reduce(0) { $0 + $1.cases }) 箱").font(.system(.headline, design: .rounded))
            .foregroundStyle(.primary)
          if stocks.reduce(0, { $0 + $1.loose }) > 0 {
            Text("另 \(stocks.reduce(0) { $0 + $1.loose }) 瓶").font(.caption).foregroundStyle(
              .secondary)
          }
        }.frame(maxWidth: .infinity, alignment: .leading)
        VStack(alignment: .leading, spacing: 6) {
          Text("待回空瓶").font(.caption).foregroundStyle(.secondary)
          Text("\(customer.bottleTotal) 瓶").font(.system(.headline, design: .rounded))
            .foregroundStyle(.primary)
        }.frame(maxWidth: .infinity, alignment: .leading)
      }
      Divider()
      HStack {
        Text(customer.receivable > 0 ? "当前应收" : "货款").font(.subheadline).foregroundStyle(.secondary)
        Spacer()
        Text(customer.receivable > 0 ? "¥\(currency(customer.receivable))" : "已结清")
          .font(.system(.headline, design: .rounded)).monospacedDigit()
          .foregroundStyle(customer.receivable > 0 ? Theme.red : Theme.green)
      }
    }
  }
}
struct CustomersView: View {
  @EnvironmentObject var store: AppStore
  @LocalState<String> private var search = ""
  @LocalState<Customer?> private var edit: Customer?
  private var customers: [Customer] {
    store.customers.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }
  }
  var body: some View {
    ScrollView {
      LazyVStack(spacing: 12) {
        HStack {
          Text("\(customers.count) 家酒吧").font(.subheadline).foregroundStyle(.secondary)
          Spacer()
          Text("最近操作在前").font(.caption).foregroundStyle(.secondary)
        }
        ForEach(customers) { c in
          NavigationLink {
            CustomerDetail(id: c.id)
          } label: {
            CustomerCard(customer: c)
          }.buttonStyle(.plain)
        }
        if customers.isEmpty {
          Surface {
            EmptyMessage(
              title: search.isEmpty ? "添加第一家酒吧" : "没有找到酒吧",
              message: search.isEmpty ? "点右上角新增，填写名称后就能开始记账。" : "试试酒吧名称中的其他文字。")
          }
        }
      }.padding(16)
    }.appScreen().searchable(text: $search, prompt: "搜索酒吧名称").navigationTitle("酒吧")
      .toolbar { Button("新增") { edit = Customer(name: "") } }
      .sheet(item: $edit) { CustomerEditor(customer: $0) }
  }
}
struct CustomerDetail: View {
  @EnvironmentObject var store: AppStore
  var id: String
  @LocalState<OperationRoute?> private var route: OperationRoute?
  @LocalState<Bool> private var editor = false
  @LocalState<Bool> private var classify = false
  var body: some View {
    if let c = store.customer(id) {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          Surface {
            SectionHeading(title: c.name, subtitle: c.contact.isEmpty ? "联系人待补充" : c.contact)
            if !c.phone.isEmpty {
              if let phoneURL = URL(string: "tel:" + c.phone.filter { $0.isNumber || $0 == "+" }) {
                Link(c.phone, destination: phoneURL).font(.subheadline)
              } else {
                Text(c.phone).font(.subheadline)
              }
            }
            Text(c.address.isEmpty ? "地址待补充" : c.address).font(.subheadline).foregroundStyle(
              .secondary)
            if !c.remark.isEmpty { Text(c.remark).font(.caption).foregroundStyle(.secondary) }
          }
          Surface {
            SectionHeading(title: "当前应收")
            Text("¥\(currency(c.receivable))").font(
              .system(.largeTitle, design: .rounded, weight: .bold)
            )
            .monospacedDigit().foregroundStyle(c.receivable > 0 ? Theme.red : Theme.green)
            if c.receivable == 0 { StatusPill(title: "已结清", color: Theme.green) }
          }
          Surface {
            SectionHeading(title: "当前库存", subtitle: "按送货与回瓶估算 · 现场盘点可校准")
            ForEach(store.stocks(id)) { s in
              VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline) {
                  Text(store.product(s.productId)?.name ?? "商品").font(
                    .subheadline.weight(.semibold))
                  Spacer(minLength: 10)
                  Text(s.label).font(.system(.headline, design: .rounded)).monospacedDigit()
                }
                Text("\(s.caseSize) 瓶/箱 · 合计 \(s.bottles) 瓶").font(.caption).foregroundStyle(
                  .secondary)
              }
              if s.id != store.stocks(id).last?.id { Divider() }
            }
            if store.stocks(id).isEmpty {
              Text("暂无库存，送货后会自动增加。").font(.subheadline).foregroundStyle(.secondary)
            }
          }
          Surface {
            SectionHeading(title: "待回空瓶", subtitle: "按商品分别统计，统一用瓶计数")
            Text("\(c.bottleTotal) 瓶").font(.system(.title, design: .rounded, weight: .bold))
              .monospacedDigit()
            ForEach(c.bottles.keys.sorted(), id: \.self) { key in
              if (c.bottles[key] ?? 0) > 0 {
                HStack(alignment: .firstTextBaseline) {
                  Text(key == unclassified ? "历史未分类" : (store.product(key)?.name ?? "商品")).font(
                    .subheadline)
                  Spacer(minLength: 12)
                  Text("\(c.bottles[key] ?? 0) 瓶").font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                }
              }
            }
            if (c.bottles[unclassified] ?? 0) > 0 {
              Divider()
              Button("核对并分类历史空瓶") { classify = true }.font(.subheadline.weight(.semibold)).frame(
                minHeight: 44)
            }
          }
          Surface {
            HStack {
              SectionHeading(title: "最近业务")
              NavigationLink("全部") { RecordsView(customerId: id) }.font(
                .subheadline.weight(.semibold)
              ).frame(minHeight: 44)
            }
            ForEach(store.database.records.filter { $0.customerId == id }.prefix(5)) { r in
              NavigationLink {
                RecordDetail(id: r.id)
              } label: {
                RecordRow(record: r)
              }.buttonStyle(.plain)
              if r.id != store.database.records.filter({ $0.customerId == id }).prefix(5).last?.id {
                Divider()
              }
            }
            if !store.database.records.contains(where: { $0.customerId == id }) {
              Text("录入第一笔业务后会显示在这里。").font(.subheadline).foregroundStyle(.secondary)
            }
          }
        }.padding(16)
      }.appScreen().navigationTitle("酒吧详情").toolbar { Button("编辑") { editor = true } }
        .safeAreaInset(edge: .bottom) {
          LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            ForEach([RecordKind.delivery, .bottleReturn, .payment, .stocktake]) { k in
              Button {
                route = OperationRoute(kind: k, customerId: id)
              } label: {
                Text(k.title).font(.headline).frame(maxWidth: .infinity, minHeight: 48)
                  .foregroundStyle(k == .delivery ? Color.white : Theme.red)
                  .background(
                    k == .delivery ? Theme.red : Theme.background,
                    in: RoundedRectangle(cornerRadius: 8))
              }.buttonStyle(.plain)
            }
          }.padding(12).background(.bar)
        }
        .sheet(item: $route) { OperationView(route: $0) }
        .sheet(isPresented: $editor) { CustomerEditor(customer: c) }
        .sheet(isPresented: $classify) { ClassifyView(customerId: id) }
    } else {
      ContentUnavailableView("找不到酒吧", systemImage: "building.2")
    }
  }
}
struct ClassifyView: View {
  @EnvironmentObject var store: AppStore
  @Environment(\.dismiss) var dismiss
  var customerId: String
  @LocalState<String> private var productId = ""
  @LocalState<String> private var count = "0"
  @LocalState<Review?> private var review: Review?
  @LocalState<String?> private var error: String?
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 14) {
          Surface {
            SectionHeading(title: "历史空瓶", subtitle: "核对分类后才能估算具体商品库存")
            Text("未分类 \(store.customer(customerId)?.bottles[unclassified] ?? 0) 瓶").font(
              .title2.bold())
            Picker("归入商品", selection: $productId) {
              Text("请选择").tag("")
              ForEach(store.products) { Text($0.name).tag($0.id) }
            }.pickerStyle(.menu).frame(minHeight: 44)
            CountControl(label: "核对的瓶数", text: $count)
            Text("只调整分类，总待回不变，不扣库存。").font(.caption).foregroundStyle(.secondary)
          }
        }.padding(16)
      }.appScreen().navigationTitle("历史空瓶分类").toolbar { Button("取消") { dismiss() } }
        .safeAreaInset(edge: .bottom) {
          MainButton(title: "核对分类") {
            do {
              let n = try parseQuantity(count)
              let pid = productId
              guard let p = store.product(pid), n > 0 else {
                throw BusinessError.message("请选择商品并输入数量")
              }
              review = Review(title: "确认分类", rows: [p.name, "将 \(n) 瓶历史空瓶归入该商品", "总待回不变"]) {
                try store.run { try $0.classify(customerId: customerId, productId: pid, count: n) }
              }
            } catch { self.error = error.localizedDescription }
          }.padding(16).background(.bar)
        }.sheet(item: $review) { r in ReviewSheet(review: r) { dismiss() } }.businessError($error)
    }
  }
}
struct EntryView: View {
  @LocalState<OperationRoute?> private var route: OperationRoute?
  private func subtitle(_ k: RecordKind) -> String {
    switch k {
    case .delivery: "送酒、记货款，同时增加待回空瓶"
    case .purchase: "增加仓库库存"
    case .bottleReturn: "分种类回瓶，估算酒吧剩余库存"
    case .payment: "记实收金额、支付方式和协商减免"
    case .stocktake: "核对仓库或酒吧的实际库存"
    }
  }
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        SectionHeading(title: "这次记什么？", subtitle: "先选业务，再选酒吧和数量").padding(.vertical, 8)
        ForEach(RecordKind.allCases) { k in
          Button {
            route = OperationRoute(kind: k)
          } label: {
            HStack(spacing: 16) {
              Image(systemName: k.icon).font(.title2).frame(width: 30)
              VStack(alignment: .leading, spacing: 6) {
                Text(k.title).font(.title3.bold())
                Text(subtitle(k)).font(.caption).foregroundStyle(
                  k == .delivery ? Color.white.opacity(0.85) : Color.secondary
                )
                .fixedSize(horizontal: false, vertical: true)
              }.frame(maxWidth: .infinity, alignment: .leading)
              Image(systemName: "chevron.right").font(.caption.weight(.semibold))
            }.padding(20).frame(minHeight: 96)
              .foregroundStyle(k == .delivery ? Color.white : Theme.red)
              .background(
                k == .delivery ? Theme.red : Color(.secondarySystemGroupedBackground),
                in: RoundedRectangle(cornerRadius: 12)
              )
              .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.border, lineWidth: 1))
          }.buttonStyle(.plain)
        }
      }.padding(16)
    }.appScreen().navigationTitle("记一笔").sheet(item: $route) { OperationView(route: $0) }
  }
}
struct RecordsView: View {
  @EnvironmentObject var store: AppStore
  var customerId: String?
  @LocalState<String> private var filter = "全部"
  private var records: [BusinessRecord] {
    store.database.records.filter {
      (customerId == nil || $0.customerId == customerId)
        && (filter == "全部" || $0.kind.title == filter
          || (filter == "库存" && [.purchase, .stocktake].contains($0.kind)))
    }
  }
  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 12) {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(["全部", "送货", "回瓶", "收款", "库存"], id: \.self) { value in
              Button {
                filter = value
              } label: {
                Text(value).font(.subheadline.weight(.semibold)).padding(.horizontal, 18).frame(
                  minHeight: 44
                )
                .foregroundStyle(filter == value ? Color.white : Color.secondary)
                .background(
                  filter == value ? Theme.red : Color(.secondarySystemGroupedBackground),
                  in: RoundedRectangle(cornerRadius: 8))
              }.buttonStyle(.plain)
            }
          }
        }
        Text("\(records.count) 条记录").font(.caption).foregroundStyle(.secondary)
        ForEach(records) { r in
          NavigationLink {
            RecordDetail(id: r.id)
          } label: {
            Surface { RecordRow(record: r) }
          }.buttonStyle(.plain)
        }
        if records.isEmpty {
          Surface { EmptyMessage(title: "暂无业务记录", message: "录入送货、回瓶或收款后，流水会自动保存在这里。") }
        }
      }.padding(16)
    }.appScreen().navigationTitle("业务记录")
  }
}
