import Charts
import SwiftUI

struct AnalysisView: View {
  @EnvironmentObject var store: AppStore
  @LocalState<Period> private var period: Period = .week
  @LocalState<Int> private var offset = 0
  @LocalState<String> private var chart = "金额"
  private var range: DateInterval { AnalysisService.range(period, offset: offset) }
  private var summary: Summary { AnalysisService.summary(store.database, interval: range) }
  private var previous: Summary {
    AnalysisService.summary(
      store.database, interval: AnalysisService.range(period, offset: offset - 1))
  }
  private func change(_ current: Int, _ prior: Int) -> String {
    let delta = current - prior
    return delta == 0 ? "¥0" : (delta > 0 ? "+¥" : "−¥") + currency(abs(delta))
  }
  private var customerRanking: [(String, Int)] {
    Dictionary(grouping: summary.records.filter { $0.kind == .delivery }, by: \.customerName).map {
      ($0.key, $0.value.reduce(0) { $0 + $1.amount })
    }.sorted { $0.1 > $1.1 }
  }
  private var productRanking: [(String, Int)] {
    Dictionary(grouping: summary.records.flatMap(\.lines), by: \.name).map {
      ($0.key, $0.value.reduce(0) { $0 + $1.cases })
    }.sorted { $0.1 > $1.1 }
  }
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        SectionHeading(title: "这一段时间，生意怎么样？", subtitle: "自然周从周一开始 · 金额按实际业务汇总").padding(.top, 4)
        Picker("周期", selection: $period) { ForEach(Period.allCases) { Text($0.rawValue).tag($0) } }
          .pickerStyle(.segmented).onChange(of: period) { _, _ in offset = 0 }
        HStack {
          Button {
            offset -= 1
          } label: {
            Image(systemName: "chevron.left").frame(width: 44, height: 44).accessibilityLabel(
              period == .week ? "上一周" : "上一月")
          }
          Spacer()
          VStack {
            Text(offset == 0 ? (period == .week ? "本周" : "本月") : "所选周期").bold()
            Text(
              "\(range.start.formatted(.dateTime.year().month().day())) — \(range.end.addingTimeInterval(-1).formatted(.dateTime.month().day()))"
            ).font(.caption).foregroundStyle(.secondary)
          }
          Spacer()
          Button {
            offset += 1
          } label: {
            Image(systemName: "chevron.right").frame(width: 44, height: 44)
          }.disabled(offset >= 0).accessibilityLabel(period == .week ? "下一周" : "下一月")
        }
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
          Metric(title: "送货金额", value: "¥\(currency(summary.sales))")
          Metric(title: "实际收款", value: "¥\(currency(summary.collected))", color: Theme.green)
          Metric(title: "送货数量", value: "\(summary.cases) 箱")
          Metric(title: "回收空瓶", value: "\(summary.bottles) 瓶")
        }
        Surface {
          SectionHeading(
            title: period == .week ? "与上一周比较" : "与上一月比较",
            subtitle: offset == 0 ? "本期尚未结束，比较时留意天数差异" : "完整自然周期比较")
          LabeledContent("送货金额变化", value: change(summary.sales, previous.sales))
          LabeledContent("实际收款变化", value: change(summary.collected, previous.collected))
        }
        Surface {
          SectionHeading(title: "业务趋势", subtitle: "每一天都保留，无业务日期显示为零")
          Picker("指标", selection: $chart) { ForEach(["金额", "送货", "回瓶"], id: \.self) { Text($0) } }
            .pickerStyle(.segmented)
          Chart(summary.points) { p in
            if chart == "金额" {
              BarMark(x: .value("日期", p.date, unit: .day), y: .value("元", Double(p.sales) / 100))
                .foregroundStyle(by: .value("类型", "送货金额")).position(by: .value("类型", "送货金额"))
              BarMark(
                x: .value("日期", p.date, unit: .day), y: .value("元", Double(p.collected) / 100)
              ).foregroundStyle(by: .value("类型", "实际收款")).position(by: .value("类型", "实际收款"))
            } else {
              BarMark(
                x: .value("日期", p.date, unit: .day),
                y: .value(chart == "送货" ? "箱" : "瓶", chart == "送货" ? p.cases : p.bottles)
              ).foregroundStyle(chart == "送货" ? Theme.red : Theme.orange)
            }
          }.chartForegroundStyleScale(["送货金额": Theme.red, "实际收款": Theme.green]).chartXAxis {
            AxisMarks(values: .stride(by: .day, count: period == .week ? 1 : 7)) {
              AxisGridLine()
              AxisTick()
              AxisValueLabel(format: .dateTime.day())
            }
          }.chartYAxis {
            AxisMarks(position: .leading) { _ in
              AxisGridLine().foregroundStyle(Theme.border)
              AxisValueLabel()
            }
          }.frame(height: 240)
          Text(
            chart == "金额" ? "金额单位：元；实收包含已付款送货，减免不算收款。" : "单位：\(chart == "送货" ? "箱" : "瓶")，含无业务日期。"
          ).font(.caption).foregroundStyle(.secondary)
        }
        Surface {
          SectionHeading(title: "协商与减免", subtitle: "少收的货款留有记录，减免不计入实收")
          LabeledContent("送货协商差额", value: "¥\(currency(summary.negotiated))")
          LabeledContent("收款减免", value: "¥\(currency(summary.reductions))")
        }
        Surface {
          Text("酒吧送货排行").font(.headline)
          ForEach(customerRanking, id: \.0) { item in
            VStack(alignment: .leading) {
              LabeledContent(item.0, value: "¥\(currency(item.1))")
              ProgressView(
                value: Double(item.1), total: Double(max(customerRanking.first?.1 ?? 1, 1))
              ).tint(Theme.red)
            }
          }
          if customerRanking.isEmpty { Text("本期暂无送货").foregroundStyle(.secondary) }
        }
        Surface {
          Text("商品送货排行").font(.headline)
          ForEach(productRanking, id: \.0) { item in LabeledContent(item.0, value: "\(item.1) 箱") }
          if productRanking.isEmpty {
            Text("本期暂无商品送出").font(.subheadline).foregroundStyle(.secondary)
          }
        }
        Surface {
          SectionHeading(title: "每日明细", subtitle: "仅列出有业务的日期")
          if summary.records.isEmpty {
            Text("本期暂无业务，录入后会自动统计。").font(.subheadline).foregroundStyle(.secondary)
          }
          ForEach(
            summary.points.filter {
              $0.sales > 0 || $0.collected > 0 || $0.cases > 0 || $0.bottles > 0
            }
          ) { p in
            VStack(alignment: .leading, spacing: 6) {
              Text(p.date, format: .dateTime.month().day()).bold()
              Text("送货 ¥\(currency(p.sales)) · 实收 ¥\(currency(p.collected))")
              Text("送货 \(p.cases) 箱 · 回瓶 \(p.bottles) 瓶").foregroundStyle(.secondary)
            }.font(.subheadline)
            Divider()
          }
        }
      }.padding(16)
    }.appScreen().navigationTitle("经营分析")
  }
}
