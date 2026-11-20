import SwiftUI
import UniformTypeIdentifiers

@MainActor final class AppStore: ObservableObject {
  @Published private(set) var database = Database()
  @Published var loadError: String?
  @Published var notice: String?
  private var repository: Repository?
  private let url: URL
  init() {
    url = URL.applicationSupportDirectory.appending(path: "BeerManager/database.json")
    do {
      let r = try Repository(url: url)
      repository = r
      database = r.database
    } catch { loadError = "本地数据读取失败，原文件已保留。请勿删除 App。\n" + error.localizedDescription }
  }
  var products: [Product] { database.products.filter { $0.deletedAt == nil } }
  var customers: [Customer] {
    database.customers.filter { !$0.deleted }.sorted { $0.lastUsed > $1.lastUsed }
  }
  func customer(_ id: String) -> Customer? { database.customers.first { $0.id == id } }
  func product(_ id: String) -> Product? { database.products.first { $0.id == id } }
  func stocks(_ id: String) -> [CustomerStock] { let ids = Set(products.map(\.id)); return database.stocks.filter { $0.customerId == id && ids.contains($0.productId) } }
  func run(_ action: (Repository) throws -> Void, success: String = "已保存") throws {
    guard let repository else { throw BusinessError.message("本地数据尚未恢复，不能录入新业务") }
    try action(repository)
    database = repository.database
    notice = success
  }
  func backup() throws -> Data {
    guard let repository else { throw BusinessError.message("无法导出，请先恢复数据") }
    return try repository.export()
  }
  func restore(_ data: Data) throws {
    if let repository {
      try repository.restore(data)
      database = repository.database
    } else {
      let d = try JSONDecoder().decode(Database.self, from: data)
      try Repository.validate(d)
      let r = try Repository(recovering: d, url: url)
      repository = r
      database = r.database
      loadError = nil
    }
    notice = "备份已恢复"
  }
}
struct BackupDocument: FileDocument {
  static var readableContentTypes: [UTType] { [.json] }
  var data = Data()
  init(data: Data) { self.data = data }
  init(configuration: ReadConfiguration) throws {
    guard let d = configuration.file.regularFileContents else {
      throw BusinessError.message("备份文件无法读取")
    }
    data = d
  }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: data)
  }
}
struct OperationRoute: Identifiable {
  var kind: RecordKind
  var customerId = ""
  var id: String { kind.rawValue + customerId }
}
extension View {
  func businessError(_ text: Binding<String?>) -> some View {
    alert(
      "未能保存",
      isPresented: Binding(
        get: { text.wrappedValue != nil }, set: { if !$0 { text.wrappedValue = nil } })
    ) {
      Button("知道了", role: .cancel) { text.wrappedValue = nil }
    } message: {
      Text(text.wrappedValue ?? "")
    }
  }
}
