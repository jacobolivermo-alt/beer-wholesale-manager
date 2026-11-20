import PhotosUI
import SwiftUI

struct RecordDetail: View {
  @EnvironmentObject var store: AppStore
  var id: String
  @LocalState<[PhotosPickerItem]> private var photos: [PhotosPickerItem] = []
  @LocalState<Bool> private var loading = false
  @LocalState<String?> private var error: String?
  @LocalState<Receipt?> private var preview: Receipt?
  @LocalState<Review?> private var review: Review?
  private var record: BusinessRecord? { store.database.records.first { $0.id == id } }
  var body: some View {
    if let r = record {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          Surface {
            HStack {
              StatusPill(title: r.kind.title, color: r.kind == .payment ? Theme.green : Theme.red)
              Spacer()
              Text(r.date, format: .dateTime.year().month().day().hour().minute())
                .font(.caption).foregroundStyle(.secondary)
            }
            Text(r.customerName).font(.title3.bold())
            if r.amount > 0 {
              Text("¥\(currency(r.amount))").font(
                .system(.largeTitle, design: .rounded, weight: .bold)
              )
              .monospacedDigit().foregroundStyle(r.kind == .payment ? Theme.green : Theme.red)
            }
            if r.quantity != 0 { Text("\(r.quantity) \(r.unit)").font(.headline).monospacedDigit() }
            Divider()
            Text(r.details).font(.subheadline).foregroundStyle(.secondary).fixedSize(
              horizontal: false, vertical: true)
            if let original = r.calculated {
              LabeledContent("计算货款", value: "¥\(currency(original))")
              LabeledContent("最终货款", value: "¥\(currency(r.amount))")
            }
            if r.reduction > 0 { LabeledContent("协商减免", value: "¥\(currency(r.reduction))") }
            if !r.reason.isEmpty {
              Text("协商说明：\(r.reason)").font(.subheadline).foregroundStyle(.secondary)
            }
          }
          Surface {
            HStack {
              SectionHeading(title: "收据附件", subtitle: "\(r.receipts.count) / 6 张 · 点图片放大")
              if loading { ProgressView() }
            }
            PhotosPicker(
              selection: $photos, maxSelectionCount: max(1, 6 - r.receipts.count), matching: .images
            ) {
              Label(loading ? "保存中…" : "从相册添加收据", systemImage: "photo.badge.plus")
                .font(.headline).frame(maxWidth: .infinity, minHeight: 50)
                .background(Theme.background, in: RoundedRectangle(cornerRadius: 8))
            }.disabled(loading || r.receipts.count >= 6).buttonStyle(.plain).foregroundStyle(
              Theme.red)
            if r.receipts.isEmpty {
              Text("可保存送货单、转账截图或手写收据，方便日后核对。")
                .font(.subheadline).foregroundStyle(.secondary)
            }
            LazyVGrid(
              columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading,
              spacing: 12
            ) {
              ForEach(r.receipts) { receipt in
                VStack(spacing: 6) {
                  if let image = UIImage(data: receipt.image) {
                    Button {
                      preview = receipt
                    } label: {
                      Image(uiImage: image).resizable().scaledToFit().frame(height: 150)
                        .frame(maxWidth: .infinity).background(
                          Theme.background, in: RoundedRectangle(cornerRadius: 6))
                    }.buttonStyle(.plain).accessibilityLabel("放大查看收据")
                  }
                  Button("移除", role: .destructive) {
                    review = Review(title: "移除收据", rows: ["只移除选中的图片，业务流水保留。"]) {
                      try store.run { try $0.removeReceipt(recordId: id, receiptId: receipt.id) }
                    }
                  }.font(.caption.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 44)
                }
              }
            }
            Text("单张最多 5MB，完整备份包含图片。拍照后可从相册选择；当前没有 App 内相机入口。")
              .font(.caption).foregroundStyle(.secondary).fixedSize(
                horizontal: false, vertical: true)
          }
        }.padding(16)
      }.appScreen().navigationTitle("流水详情").onChange(of: photos) { _, items in upload(items) }
        .businessError($error)
        .sheet(item: $preview) { receipt in
          NavigationStack {
            if let image = UIImage(data: receipt.image) {
              ScrollView([.horizontal, .vertical]) {
                Image(uiImage: image).resizable().scaledToFit().frame(width: 800)
              }.navigationTitle("收据预览").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("关闭") { preview = nil } }
            }
          }
        }.sheet(item: $review) { r in ReviewSheet(review: r) {} }
    } else {
      ContentUnavailableView("找不到记录", systemImage: "doc.text")
    }
  }
  private func upload(_ items: [PhotosPickerItem]) {
    guard !items.isEmpty && !loading else { return }
    loading = true
    Task { @MainActor in
      defer {
        loading = false
        photos = []
      }
      do {
        var images: [Data] = []
        for item in items {
          guard let data = try await item.loadTransferable(type: Data.self),
            let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.85)
          else { throw BusinessError.message("图片无法读取") }
          guard jpeg.count <= 5 * 1024 * 1024 else { throw BusinessError.message("单张图片不能超过 5MB") }
          images.append(jpeg)
        }
        try store.run({ try $0.attach(recordId: id, images: images) }, success: "收据已保存")
      } catch { self.error = error.localizedDescription }
    }
  }
}
