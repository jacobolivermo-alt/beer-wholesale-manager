import Foundation

enum Period: String, CaseIterable, Identifiable {
  case week = "周统计"
  case month = "月统计"
  var id: String { rawValue }
}
struct TrendPoint: Identifiable {
  var date: Date
  var sales: Int
  var collected: Int
  var cases: Int
  var bottles: Int
  var id: Date { date }
}
struct Summary {
  var sales = 0
  var collected = 0
  var cases = 0
  var bottles = 0
  var reductions = 0
  var negotiated = 0
  var points: [TrendPoint] = []
  var records: [BusinessRecord] = []
}
enum AnalysisService {
  static func range(
    _ period: Period, offset: Int, now: Date = Date(), calendar: Calendar = .current
  ) -> DateInterval {
    var cal = calendar
    cal.firstWeekday = 2
    cal.minimumDaysInFirstWeek = 4
    let component: Calendar.Component = period == .week ? .weekOfYear : .month
    let current = cal.dateInterval(of: component, for: now)!
    let start = cal.date(byAdding: component, value: offset, to: current.start)!
    return cal.dateInterval(of: component, for: start)!
  }
  static func summary(_ db: Database, interval: DateInterval, calendar: Calendar = .current)
    -> Summary
  {
    let records = db.records.filter { $0.date >= interval.start && $0.date < interval.end }
    let deliveries = records.filter { $0.kind == .delivery }
    var s = Summary(
      sales: deliveries.reduce(0) { $0 + $1.amount },
      collected: records.reduce(0) { $0 + $1.collected },
      cases: deliveries.reduce(0) { $0 + $1.quantity },
      bottles: records.filter { $0.kind == .bottleReturn }.reduce(0) { $0 + $1.quantity },
      reductions: records.reduce(0) { $0 + $1.reduction },
      negotiated: deliveries.reduce(0) { $0 + ($1.calculated ?? $1.amount) - $1.amount },
      records: records)
    var day = interval.start
    while day < interval.end {
      let end = calendar.date(byAdding: .day, value: 1, to: day)!
      let entries = records.filter { $0.date >= day && $0.date < end }
      s.points.append(
        TrendPoint(
          date: day, sales: entries.filter { $0.kind == .delivery }.reduce(0) { $0 + $1.amount },
          collected: entries.reduce(0) { $0 + $1.collected },
          cases: entries.filter { $0.kind == .delivery }.reduce(0) { $0 + $1.quantity },
          bottles: entries.filter { $0.kind == .bottleReturn }.reduce(0) { $0 + $1.quantity }))
      day = end
    }
    return s
  }
}
