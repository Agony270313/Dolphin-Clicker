using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Threading;

// Define Assembly metadata to establish publisher reputation
[assembly: System.Reflection.AssemblyTitle("Dolphin Clicker Engine")]
[assembly: System.Reflection.AssemblyDescription("High-performance simulation module for Dolphin Clicker")]
[assembly: System.Reflection.AssemblyConfiguration("")]
[assembly: System.Reflection.AssemblyCompany("Agony270313")]
[assembly: System.Reflection.AssemblyProduct("Dolphin Clicker")]
[assembly: System.Reflection.AssemblyCopyright("Copyright © 2026 Agony270313")]
[assembly: System.Reflection.AssemblyTrademark("")]
[assembly: System.Reflection.AssemblyCulture("")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.0.0.0")]

class DolphinClickerBackend {
    [DllImport("winmm.dll", EntryPoint = "timeBeginPeriod")]
    public static extern uint TimeBeginPeriod(uint uMilliseconds);

    [DllImport("winmm.dll", EntryPoint = "timeEndPeriod")]
    public static extern uint TimeEndPeriod(uint uMilliseconds);

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    // Win32 Struct definitions for SendInput
    [StructLayout(LayoutKind.Sequential)]
    struct INPUT {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct HARDWAREINPUT {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    const uint INPUT_MOUSE = 0;
    const uint INPUT_KEYBOARD = 1;

    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;
    const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    const uint KEYEVENTF_KEYUP = 0x0002;

    static ConcurrentDictionary<string, ClickerTask> activeTasks = new ConcurrentDictionary<string, ClickerTask>();

    class ClickerTask {
        public string Id;
        public string Type; // "mouse" or "keyboard"
        public string Button; // "left", "right", "middle"
        public string ClickType; // "single", "double"
        public byte KeyCode;
        public int IntervalMs;
        public int ClickLimit;
        
        public bool Running;
        public Thread WorkingThread;
        public int ClickCount;
    }

    static void Main(string[] args) {
        TimeBeginPeriod(1);
        Console.WriteLine("Dolphin Clicker Backend Active");
        
        string line;
        while ((line = Console.ReadLine()) != null) {
            try {
                if (string.IsNullOrEmpty(line)) continue;
                string[] parts = line.Split(' ');
                if (parts.Length == 0) continue;
                
                string command = parts[0].ToLower();
                if (command == "start") {
                    string id = parts[1];
                    string type = parts[2].ToLower();
                    
                    ClickerTask task = new ClickerTask {
                        Id = id,
                        Type = type,
                        Running = true,
                        ClickCount = 0
                    };
                    
                    if (type == "mouse") {
                        task.Button = parts[3].ToLower();
                        task.ClickType = parts[4].ToLower();
                        task.IntervalMs = int.Parse(parts[5]);
                        task.ClickLimit = parts.Length > 6 ? int.Parse(parts[6]) : 0;
                        
                        StopTask(id);
                        
                        task.WorkingThread = new Thread(() => RunMouseClicker(task));
                        task.WorkingThread.IsBackground = true;
                        activeTasks[id] = task;
                        task.WorkingThread.Start();
                    }
                    else if (type == "keyboard") {
                        task.KeyCode = byte.Parse(parts[3]);
                        task.IntervalMs = int.Parse(parts[4]);
                        task.ClickLimit = parts.Length > 5 ? int.Parse(parts[5]) : 0;
                        
                        StopTask(id);
                        
                        task.WorkingThread = new Thread(() => RunKeyboardSpammer(task));
                        task.WorkingThread.IsBackground = true;
                        activeTasks[id] = task;
                        task.WorkingThread.Start();
                    }
                    
                    Console.WriteLine("ACK start " + id);
                }
                else if (command == "stop") {
                    string id = parts[1];
                    StopTask(id);
                    Console.WriteLine("ACK stop " + id);
                }
                else if (command == "stop_all") {
                    foreach (var key in activeTasks.Keys) {
                        StopTask(key);
                    }
                    Console.WriteLine("ACK stop_all");
                }
                else if (command == "exit") {
                    break;
                }
            }
            catch (Exception ex) {
                Console.WriteLine("ERROR " + ex.Message);
            }
        }
        
        foreach (var key in activeTasks.Keys) {
            StopTask(key);
        }
        TimeEndPeriod(1);
    }

    static void StopTask(string id) {
        ClickerTask task;
        if (activeTasks.TryRemove(id, out task)) {
            task.Running = false;
            if (task.WorkingThread != null && task.WorkingThread.IsAlive) {
                task.WorkingThread.Join(100);
            }
        }
    }

    static void RunMouseClicker(ClickerTask task) {
        uint downFlag = MOUSEEVENTF_LEFTDOWN;
        uint upFlag = MOUSEEVENTF_LEFTUP;
        
        if (task.Button == "right") {
            downFlag = MOUSEEVENTF_RIGHTDOWN;
            upFlag = MOUSEEVENTF_RIGHTUP;
        } else if (task.Button == "middle") {
            downFlag = MOUSEEVENTF_MIDDLEDOWN;
            upFlag = MOUSEEVENTF_MIDDLEUP;
        }
        
        int inputSize = Marshal.SizeOf(typeof(INPUT));
        
        while (task.Running) {
            // Send Click Down and Up using SendInput API
            INPUT[] inputs = new INPUT[2];
            
            inputs[0] = new INPUT();
            inputs[0].type = INPUT_MOUSE;
            inputs[0].U.mi.dwFlags = downFlag;
            
            inputs[1] = new INPUT();
            inputs[1].type = INPUT_MOUSE;
            inputs[1].U.mi.dwFlags = upFlag;
            
            SendInput(2, inputs, inputSize);
            task.ClickCount++;
            Console.WriteLine("STAT " + task.Id + " " + task.ClickCount);
            
            if (task.ClickType == "double") {
                Thread.Sleep(10);
                
                inputs[0] = new INPUT();
                inputs[0].type = INPUT_MOUSE;
                inputs[0].U.mi.dwFlags = downFlag;
                
                inputs[1] = new INPUT();
                inputs[1].type = INPUT_MOUSE;
                inputs[1].U.mi.dwFlags = upFlag;
                
                SendInput(2, inputs, inputSize);
                task.ClickCount++;
                Console.WriteLine("STAT " + task.Id + " " + task.ClickCount);
            }
            
            if (task.ClickLimit > 0 && task.ClickCount >= task.ClickLimit) {
                Console.WriteLine("LIMIT_REACHED " + task.Id);
                task.Running = false;
                break;
            }
            
            if (task.IntervalMs > 0) {
                Thread.Sleep(task.IntervalMs);
            }
        }
    }

    static void RunKeyboardSpammer(ClickerTask task) {
        int inputSize = Marshal.SizeOf(typeof(INPUT));
        
        while (task.Running) {
            INPUT[] inputs = new INPUT[2];
            
            // Key Down
            inputs[0] = new INPUT();
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].U.ki.wVk = task.KeyCode;
            inputs[0].U.ki.dwFlags = 0;
            
            // Key Up
            inputs[1] = new INPUT();
            inputs[1].type = INPUT_KEYBOARD;
            inputs[1].U.ki.wVk = task.KeyCode;
            inputs[1].U.ki.dwFlags = KEYEVENTF_KEYUP;
            
            SendInput(2, inputs, inputSize);
            task.ClickCount++;
            Console.WriteLine("STAT " + task.Id + " " + task.ClickCount);
            
            if (task.ClickLimit > 0 && task.ClickCount >= task.ClickLimit) {
                Console.WriteLine("LIMIT_REACHED " + task.Id);
                task.Running = false;
                break;
            }
            
            if (task.IntervalMs > 0) {
                Thread.Sleep(task.IntervalMs);
            }
        }
    }
}
