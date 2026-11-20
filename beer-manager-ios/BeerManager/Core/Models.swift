import Foundation

let unclassified = "UNCLASSIFIED"
func uid() -> String { UUID().uuidString }
func currency(_ cents: Int) -> String {
  (Double(cents) / 100).formatted(.number.precision(.fractionLength(0...2)).grouping(.automatic))
}
func parseMoney(_ value: String) throws -> Int {
  let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
  guard text.range(of: #"^\d+(\.\d{1,2})?$"#, options: .regularExpression) != nil,
    let decimal = Decimal(string: text), decimal <= 99_999_999
  else { throw BusinessError.message("金额须为非负数，最多两位小数") }
  return NSDecimalNumber(decimal: decimal * 100).intValue
}
func parseQuantity(_ text: String) throws -> Int {
  guard text.range(of: #"^\d+$"#, options: .regularExpression) != nil,
    let n = Int(text), n <= 999999
  else { throw BusinessError.message("数量须为 0 至 999999 的整数") }
  return n
}
enum BusinessError: LocalizedError {
  case message(String)
  var errorDescription: String? {
    if case .message(let s) = self { return s }
    return nil
  }
}
struct Product: Codable, Identifiable, Equatable {
  var id = uid()
  var name: String
  var price: Int
  var stock: Int
  var threshold = 15
  var bottlesPerCase = 24
  var deletedAt: String? = nil
}
struct Customer: Codable, Identifiable, Equatable {
  var id = uid()
  var name: String
  var contact = ""
  var phone = ""
  var address = ""
  var remark = ""
  var receivable = 0
  var bottles: [String: Int] = [:]
  var prices: [String: Int] = [:]
  var deleted = false
  var lastUsed = Date.distantPast
  var bottleTotal: Int { bottles.values.reduce(0, +) }
}
struct CustomerStock: Codable, Identifiable, Equatable {
  var id = uid()
  var customerId: String
  var productId: String
  var bottles: Int
  var caseSize: Int
  var cases: Int { bottles / caseSize }
  var loose: Int { bottles % caseSize }
  var label: String { "\(cases) 箱" + (loose > 0 ? "＋\(loose) 瓶" : "") }
}
enum RecordKind: String, Codable, CaseIterable, Identifiable {
  case delivery, purchase, bottleReturn, payment, stocktake
  var id: String { rawValue }
  var title: String {
    switch self {
    case .delivery: return "送货"
    case .purchase: return "进货"
    case .bottleReturn: return "回瓶"
    case .payment: return "收款"
    case .stocktake: return "盘点"
    }
  }
  var icon: String {
    switch self {
    case .delivery: return "shippingbox"
    case .purchase: return "shippingbox.and.arrow.backward"
    case .bottleReturn: return "arrow.uturn.backward"
    case .payment: return "yensign.circle"
    case .stocktake: return "checklist"
    }
  }
}
struct OrderLine: Codable, Identifiable, Equatable {
  var productId: String
  var name: String
  var cases: Int
  var price: Int
  var caseSize: Int
  var id: String { productId }
  var amount: Int { cases * price }
  var bottles: Int { cases * caseSize }
}
struct Receipt: Codable, Identifiable, Equatable {
  var id = uid()
  var image: Data
}
struct BusinessRecord: Codable, Identifiable, Equatable {
  var id = uid()
  var kind: RecordKind
  var customerId: String?
  var customerName: String = "仓库"
  var date = Date()
  var details: String
  var amount = 0
  var collected = 0
  var quantity = 0
  var unit = "箱"
  var calculated: Int?
  var reduction = 0
  var reason = ""
  var lines: [OrderLine] = []
  var receipts: [Receipt] = []
}
struct Database: Codable, Equatable {
  var version = 1
  var products: [Product] = []
  var customers: [Customer] = []
  var stocks: [CustomerStock] = []
  var records: [BusinessRecord] = []
  static func seed() -> Database {
    var d = Database()
    d.products = [
      Product(id: "p-u8", name: "燕京 U8", price: 7200, stock: 82),
      Product(id: "p-pure", name: "燕京纯生", price: 6800, stock: 45),
      Product(id: "p-white", name: "燕京白啤", price: 7500, stock: 23),
      Product(id: "p-fresh", name: "燕京鲜啤", price: 6500, stock: 12),
    ]
    d.customers = [
      Customer(
        id: "c-old", name: "示例酒吧 A", contact: "示例联系人", receivable: 342000, bottles: [unclassified: 432]),
      Customer(id: "c-space", name: "DEMO BAR B", bottles: [unclassified: 912]),
      Customer(id: "c-1988", name: "DEMO BAR C", receivable: 186000, bottles: [unclassified: 192]),
    ]
    d.stocks = [
      ("c-old", "p-u8", 12), ("c-old", "p-pure", 8), ("c-space", "p-u8", 16),
      ("c-space", "p-white", 12), ("c-1988", "p-u8", 3), ("c-1988", "p-pure", 2),
    ].map { CustomerStock(customerId: $0.0, productId: $0.1, bottles: $0.2 * 24, caseSize: 24) }
    return d
  }
}
