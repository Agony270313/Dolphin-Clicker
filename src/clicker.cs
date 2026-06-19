using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Threading;

class DolphinClickerBackend {
    [DllImport("winmm.dll", EntryPoint = "timeBeginPeriod")]
    public static extern uint TimeBeginPeriod(uint uMilliseconds);

    [DllImport("winmm.dll", EntryPoint = "timeEndPeriod")]
    public static extern uint TimeEndPeriod(uint uMilliseconds);

    [DllImport("user32.dll")]
    static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

    [DllImport("user32.dll")]
    static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    const int MOUSEEVENTF_LEFTDOWN = 0x02;
    const int MOUSEEVENTF_LEFTUP = 0x04;
    const int MOUSEEVENTF_RIGHTDOWN = 0x08;
    const int MOUSEEVENTF_RIGHTUP = 0x10;
    const int MOUSEEVENTF_MIDDLEDOWN = 0x20;
    const int MOUSEEVENTF_MIDDLEUP = 0x40;
    const int KEYEVENTF_KEYUP = 0x0002;

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
                    // start <id> mouse <button> <click_type> <interval_ms> [click_limit]
                    // start <id> keyboard <key_code> <interval_ms> [click_limit]
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
        int downFlag = MOUSEEVENTF_LEFTDOWN;
        int upFlag = MOUSEEVENTF_LEFTUP;
        
        if (task.Button == "right") {
            downFlag = MOUSEEVENTF_RIGHTDOWN;
            upFlag = MOUSEEVENTF_RIGHTUP;
        } else if (task.Button == "middle") {
            downFlag = MOUSEEVENTF_MIDDLEDOWN;
            upFlag = MOUSEEVENTF_MIDDLEUP;
        }
        
        while (task.Running) {
            mouse_event(downFlag, 0, 0, 0, 0);
            mouse_event(upFlag, 0, 0, 0, 0);
            task.ClickCount++;
            Console.WriteLine("STAT " + task.Id + " " + task.ClickCount);
            
            if (task.ClickType == "double") {
                Thread.Sleep(10);
                mouse_event(downFlag, 0, 0, 0, 0);
                mouse_event(upFlag, 0, 0, 0, 0);
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
        while (task.Running) {
            keybd_event(task.KeyCode, 0, 0, 0); // Down
            keybd_event(task.KeyCode, 0, KEYEVENTF_KEYUP, 0); // Up
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
