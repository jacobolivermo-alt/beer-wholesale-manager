import SwiftUI

// 显式引用 State 属性包装器，兼容旧部署目标与 SDK 新增的同名宏。
typealias LocalState<Value> = SwiftUI.State<Value>

enum Theme {
  static let red = Color(red: 174.0 / 255, green: 38.0 / 255, blue: 50.0 / 255)
  static let green = Color(red: 38.0 / 255, green: 118.0 / 255, blue: 82.0 / 255)
  static let orange = Color(red: 170.0 / 255, green: 106.0 / 255, blue: 22.0 / 255)
  static let background = Color(red: 245.0 / 255, green: 246.0 / 255, blue: 243.0 / 255)
  static let border = Color(red: 230.0 / 255, green: 232.0 / 255, blue: 228.0 / 255)
  static let muted = Color.secondary
}
struct Surface<Content: View>: View {
  @ViewBuilder var content: Content
  var body: some View {
    VStack(alignment: .leading, spacing: 16) { content }
      .padding(18).frame(maxWidth: .infinity, alignment: .leading)
      .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
      .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.border, lineWidth: 1))
  }
}
struct SectionHeading: View {
  var title: String
  var subtitle: String = ""
  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(title).font(.headline).foregroundStyle(.primary)
      if !subtitle.isEmpty { Text(subtitle).font(.caption).foregroundStyle(.secondary) }
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
}
struct StatusPill: View {
  var title: String
  var color: Color = Theme.red
  var body: some View {
    Text(title).font(.caption.weight(.semibold)).foregroundStyle(color)
      .padding(.horizontal, 9).padding(.vertical, 5)
      .background(color.opacity(0.08), in: RoundedRectangle(cornerRadius: 5))
      .fixedSize(horizontal: false, vertical: true)
  }
}
struct Metric: View {
  var title: String
  var value: String
  var color = Color.primary
  var body: some View {
    Surface {
      VStack(alignment: .leading, spacing: 9) {
        Text(title).font(.subheadline).foregroundStyle(.secondary)
        Text(value).font(.system(.title2, design: .rounded, weight: .bold))
          .foregroundStyle(color).monospacedDigit().minimumScaleFactor(0.7)
          .fixedSize(horizontal: false, vertical: true)
      }.frame(maxWidth: .infinity, minHeight: 60, alignment: .topLeading)
    }
  }
}
struct AmountField: View {
  var label: String
  @Binding var text: String
  var placeholder = "0"
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(label).font(.subheadline).foregroundStyle(.secondary)
      TextField(placeholder, text: $text).keyboardType(.decimalPad)
        .font(.system(.title3, design: .rounded, weight: .semibold)).monospacedDigit()
        .padding(14).background(Theme.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.border, lineWidth: 1))
    }
  }
}
struct TextInput: View {
  var label: String
  @Binding var text: String
  var placeholder = ""
  var keyboard: UIKeyboardType = .default
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(label).font(.subheadline).foregroundStyle(.secondary)
      TextField(placeholder.isEmpty ? label : placeholder, text: $text, axis: .vertical)
        .keyboardType(keyboard).lineLimit(1...4).padding(14)
        .background(Theme.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.border, lineWidth: 1))
    }
  }
}
struct CountControl: View {
  var label: String
  @Binding var text: String
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(label).font(.subheadline).foregroundStyle(.secondary)
      HStack(spacing: 0) {
        Button {
          adjust(-1)
        } label: {
          Image(systemName: "minus").font(.headline).frame(width: 56, height: 52)
        }.disabled((Int(text) ?? 0) <= 0).accessibilityLabel("减少一")
        TextField("0", text: $text).keyboardType(.numberPad).multilineTextAlignment(.center)
          .font(.system(.title2, design: .rounded, weight: .bold)).monospacedDigit()
          .frame(maxWidth: .infinity, minHeight: 52).background(
            Color(.secondarySystemGroupedBackground)
          )
          .accessibilityLabel(label)
        Button {
          adjust(1)
        } label: {
          Image(systemName: "plus").font(.headline).frame(width: 56, height: 52)
        }.accessibilityLabel("增加一")
      }.background(Theme.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
      HStack(spacing: 8) {
        ForEach([1, 5, 10], id: \.self) { n in
          Button("＋\(n)") { adjust(n) }.font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Theme.background, in: RoundedRectangle(cornerRadius: 8))
        }
      }
    }.buttonStyle(.plain).foregroundStyle(Theme.red)
  }
  private func adjust(_ delta: Int) {
    let current = min(999999, max(0, Int(text) ?? 0))
    text = String(min(999999, max(0, current + delta)))
  }
}
struct MainButton: View {
  var title: String
  var action: () -> Void
  var body: some View {
    Button(action: action) {
      Text(title).font(.headline).frame(maxWidth: .infinity, minHeight: 54)
        .foregroundStyle(.white).background(Theme.red, in: RoundedRectangle(cornerRadius: 10))
    }.buttonStyle(.plain)
  }
}
struct RecordRow: View {
  var record: BusinessRecord
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        StatusPill(
          title: record.kind.title, color: record.kind == .payment ? Theme.green : Theme.red)
        Text(record.customerName).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
          .lineLimit(2)
        Spacer(minLength: 4)
        if !record.receipts.isEmpty {
          Label("\(record.receipts.count)", systemImage: "photo").font(.caption).foregroundStyle(
            .secondary)
        }
      }
      Text(record.details).font(.subheadline).foregroundStyle(.secondary)
        .lineLimit(3).fixedSize(horizontal: false, vertical: true)
      HStack(alignment: .firstTextBaseline) {
        Text(record.date, format: .dateTime.month().day().hour().minute())
          .font(.caption).foregroundStyle(.secondary)
        Spacer(minLength: 8)
        if record.quantity != 0 {
          Text("\(record.quantity) \(record.unit)").font(.subheadline.weight(.semibold))
            .foregroundStyle(.primary)
        }
        if record.amount > 0 {
          Text("¥\(currency(record.amount))").font(.system(.headline, design: .rounded))
            .monospacedDigit().foregroundStyle(record.kind == .payment ? Theme.green : Theme.red)
        }
      }
    }.padding(.vertical, 4)
  }
}
struct EmptyMessage: View {
  var title: String
  var message: String
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title).font(.headline)
      Text(message).font(.subheadline).foregroundStyle(.secondary).fixedSize(
        horizontal: false, vertical: true)
    }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 14)
  }
}
extension View {
  func appScreen() -> some View {
    self.background(Theme.background).navigationBarTitleDisplayMode(.inline)
  }
}
