# Beer Wholesale Manager / 啤酒批发管家

A small-business tool for tracking beer deliveries, customer balances, inventory, bottle returns, receipts and backups. This repository contains source snapshots for three separately stored versions of the project. The current interface is in Chinese.

## Project folders

- `beer-manager-web/` — browser version (V1.5.4), built with HTML, CSS and JavaScript. Its generated business-service bundle comes from the TypeScript mini-program services. The app stores business records locally in the browser and receipt images in IndexedDB.
- `beer-manager/` — native WeChat mini-program in TypeScript, with business services and automated tests.
- `beer-manager-ios/` — native SwiftUI iOS project and core tests.

The three versions do not automatically share data. They have different version histories and may not have identical features. This repository does not include a live business ledger; the included seed data is for demonstration and its customer names have been made generic.

## Try the browser version locally

```sh
cd beer-manager-web
python3 -m http.server 8767
```

Open `http://localhost:8767/`. The publicly deployed app is at https://beer-manager-jm.jacobolivermo.chatgpt.site/app/. That deployment may differ from this source snapshot.

To rebuild the web business-service bundle, install the `typescript` development dependency in `beer-manager-web/` and run `npm run build`. The source folders must remain siblings as laid out here.

## Tests and native projects

The mini-program README explains importing the project in WeChat Developer Tools and running `npm install` / `npm test`. Its app ID in this copy is a generic test placeholder; use your own app ID for deployment. The iOS README describes opening the Xcode project and running the core Swift tests.

Data exports can contain sensitive business records and receipt images. They are intentionally excluded from this source snapshot.
