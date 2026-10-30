# MyFlow

### Your Money. Your Flow.

A personal finance and expense management application built with React Native and Expo. MyFlow helps you track income, expenses, budgets, transactions, and personal lending — all in one place.

<p align="center">
  <strong>Personal Finance · Expense Tracking · Budget Management</strong>
</p>

---

## ✨ Features

- **Dashboard** – Get a quick overview of your financial activity.
- **Income & Expenses** – Record and manage your daily transactions.
- **Transaction History** – Review and organize your financial records.
- **People & Loans** – Track money lent and borrowed, including partial repayments.
- **Analytics** – Visualize spending patterns and financial trends.
- **Budget Management** – Set budgets and monitor expenses.
- **Data Backup & Restore** – Export and restore your financial data.
- **Daily Notifications** – Receive financial reminders.
- **Offline-first** – Access your financial records without requiring an internet connection.

## 🎨 Design

MyFlow uses an Obsidian Minimal Dark theme, designed around a clean interface, subtle surfaces, and a focused financial dashboard.

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| React Native | Mobile application framework |
| Expo | Development and build tooling |
| TypeScript | Type-safe application development |
| Expo Router | File-based navigation |
| SQLite | Local database and persistence |
| React Native Safe Area Context | Safe area handling |

## 📂 Project Structure

```text
MyFlow/
├── android/             # Native Android project
├── assets/              # App icons and assets
├── src/
│   ├── app/             # Screens and navigation
│   ├── components/      # Reusable UI components
│   ├── constants/       # Theme and categories
│   ├── db/              # SQLite schema and repositories
│   ├── services/        # Notifications and backup
│   ├── types/           # TypeScript definitions
│   └── utils/           # Utility functions
├── tests/               # Automated tests
├── app.json
├── package.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js
- npm
- Android Studio and Android SDK
- Java Development Kit (JDK)

### Installation

Clone the repository:

```bash
git clone https://github.com/abhinandan068/MyFlow.git
```

Navigate into the project:

```bash
cd MyFlow
```

Install dependencies:

```bash
npm install
```

Start the Expo development server:

```bash
npx expo start
```

### Android Release Build

To build the standalone Android APK on Windows:

```powershell
cd android
.\gradlew.bat assembleRelease
```

The generated APK will be available at:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## 📦 Download

Download the latest Android APK from the GitHub Releases page:

[**MyFlow Releases**](https://github.com/abhinandan068/MyFlow/releases)

## 🔒 Privacy & Storage

MyFlow follows a local-first approach:

- Financial records are stored locally using SQLite.
- No mandatory account or cloud synchronization.
- Designed to work offline.
- Backup and restore functionality helps manage your data.

## 🧪 Testing

The project includes automated tests covering financial calculations, transactions, people, analytics, budgets, and date utilities.

## 🗺️ Roadmap

- [x] Income and expense tracking
- [x] Transaction history
- [x] People and loan management
- [x] Analytics and budgets
- [x] Local database persistence
- [x] Backup and restore
- [ ] Further UI refinements
- [ ] Additional financial insights

## 🤝 Contributing

Suggestions, bug reports, and feature requests are welcome!

Feel free to open an issue or submit a pull request.

## 📄 License

No license has been specified yet. All rights are reserved unless a license is added to this repository.

---

<p align="center">
  <strong>MyFlow</strong><br/>
  Your Money. Your Flow.
</p>
