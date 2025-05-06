# 🧩 autoGenerate VS Code Extension

`autoGenerate` is a Visual Studio Code extension designed to assist API development teams by automating tasks related to protocol files, Git branching, and MongoDB scripting.

---

## 🚀 Key Features

### 1. 🔀 Auto Create Git Branch
- Automatically creates a Git branch from a protocol file
- Branch format: `feature/api_<method>-<commandName>`
- Loads and collects all related JSON files referenced via `@TABLE.collection.document`

### 2. 📜 Generate MongoDB Script
- Generates `updateOne(..., { upsert: true })` scripts for MongoDB
- Based on protocol data, resource profiles, and all related JSON files

### 3. 🔍 Recursive Redirect JSON Lookup
- Searches for `@TABLE.collection.document` references within deeply nested protocol JSON
- Automatically fetches and includes those JSON files

### 4. 📂 Validate Resource Profile
- Checks `protocol.url` and finds the matching files within the `resource_profile` directory

---

## 🛠 How to Use

### Open Command Palette
Press `Ctrl + Shift + P` (or `Cmd + Shift + P` on macOS)

### Available Commands

#### ▶️ `AutoBrancher: Run`
- Input a `commandName` (e.g., `cpassCallback`) to create a branch and collect related files
- Use `*` to apply to all protocol files

#### 📝 `GenerateScript: Run`
- Input a `commandName` to generate a MongoDB script for that specific command
- Use `*` to generate scripts for all protocols

---

## 📁 Folder Structure (Expected)

```plaintext
protocol/             # Folder containing protocol JSON files
resource_profile/     # Folder containing resource profile files
<collection>/<document>.json   # Referenced JSON files (via @TABLE)
