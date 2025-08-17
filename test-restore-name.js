const fetch = require('node-fetch');

async function testRestoreName() {
    try {
        console.log('🔐 Testing login first...');
        
        // Test login
        const loginResponse = await fetch('https://cown.name.vn/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'nghiaht281003@gmail.com',
                password: '123456' // Assuming this is the password
            })
        });
        
        const loginData = await loginResponse.json();
        console.log('Login response:', loginData);
        
        if (loginData.success && loginData.token) {
            console.log('✅ Login successful');
            
            // Test restore name
            console.log('🔧 Testing restore name...');
            const restoreResponse = await fetch('https://cown.name.vn/api/restore-name', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${loginData.token}`
                },
                body: JSON.stringify({
                    userId: '68a15b2019f7029868b8cb39',
                    fullName: 'Nghĩa Trọng'
                })
            });
            
            const restoreData = await restoreResponse.json();
            console.log('Restore response:', restoreData);
        } else {
            console.log('❌ Login failed');
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

testRestoreName();
