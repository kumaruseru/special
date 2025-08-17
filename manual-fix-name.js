// Manual Fix Script for Corrupted Names
// Run this in browser console after logging in

async function fixMyName() {
    const newName = prompt("Enter your real name:", "Nghĩa Trọng");
    if (!newName) return;
    
    const userId = "68a15b2019f7029868b8cb39"; // Your user ID
    
    try {
        const response = await fetch('/api/restore-name', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                fullName: newName
            })
        });
        
        const result = await response.json();
        console.log('Restore result:', result);
        
        if (result.success) {
            alert('Name restored successfully! Please refresh the page.');
            location.reload();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error restoring name: ' + error.message);
    }
}

// Usage:
// 1. Login to https://cown.name.vn
// 2. Open browser console (F12)
// 3. Paste this code and press Enter
// 4. Run: fixMyName()

console.log("Script loaded. Run fixMyName() to restore your name.");
