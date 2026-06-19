# Dolphin Clicker 🐬

Dolphin Clicker is a high-performance, custom auto-clicker application with support for both **mouse click spamming** and **keyboard key spamming**. It features a modern, premium dark-teal glassmorphism GUI styled after **Dolphin Animate V2**.

## 🌟 Features

- **Ultra-Fast Mouse Clicking**: Simulates Left, Right, and Middle clicks (single or double click) with sub-millisecond precision.
- **Keyboard Key Spammer**: Spam any standard keyboard key (letters, numbers, space, enter, function keys) at custom intervals.
- **High-Performance C# Core**: Uses a compiled C# background worker that alters the Windows timer period to 1ms to bypass standard 15.6ms thread sleep limits.
- **Global Hotkeys**: Configure individual toggle hotkeys for each profile (e.g. `F6`, `F9`) and a master emergency stop (`F8`) that work globally even when you are playing a game.
- **Custom Aesthetic Themes**: Toggle between multiple premium themes: *Dolphin Teal*, *Electric Indigo*, *Neon Violet*, *Crimson Red*, and *Sunset Orange*.
- **Tray Minimization**: Minimize the application to the system tray to keep your taskbar clean.
- **Audio Feedback**: Subtle synthetic double-beeps when starting and stopping clickers.
- **Click Limits**: Set clickers to run infinitely or automatically stop after a specific number of clicks.

## 🚀 How to Run

### Prerequisites
- [Node.js](https://nodejs.org/) installed.
- Windows Operating System (since the backend uses native Windows APIs).

### Installation & Launch
1. Clone this repository:
   ```bash
   git clone https://github.com/Agony270313/Dolphin-Clicker.git
   cd Dolphin-Clicker
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application:
   ```bash
   npm start
   ```

## 🛠️ Compilation of C# Core

The C# clicking engine source code is available in `src/clicker.cs`. A pre-compiled version `clicker.exe` is already included. 

If you want to recompile the backend, simply run the compilation batch file:
```bash
compile.bat
```
*(This script uses the built-in Windows C# compiler `csc.exe` located under `.NET Framework` directories, so no external Visual Studio/MSBuild installation is required.)*

## 📜 License

This project is open-source and available under the MIT License.
