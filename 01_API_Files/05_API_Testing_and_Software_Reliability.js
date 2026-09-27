const https = require('https');
const http = require('http');

/**
 * Automated API Testing & Software Reliability checks
 * This script runs automated checks against backend endpoints to ensure uptime
 * and correct data formatting (Reliability & Robustness testing).
 */

async function runReliabilityTest(url) {
    console.log(`Starting Software Reliability Test for API: ${url}`);
    
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        const startTime = Date.now();
        client.get(url, (res) => {
            const responseTime = Date.now() - startTime;
            let data = '';

            res.on('data', chunk => { data += chunk; });

            res.on('end', () => {
                const isReliableResponseTime = responseTime < 500; // API should respond in under 500ms
                
                let parsedData;
                let isDataFormatValid = false;
                try {
                    parsedData = JSON.parse(data);
                    isDataFormatValid = parsedData.hasOwnProperty('success'); // Consistent API envelope
                } catch (e) {
                    console.error("API did not return valid JSON");
                }

                console.log('--- RELIABILITY REPORT ---');
                console.log(`Status Code: ${res.statusCode} (Expected: 200/201)`);
                console.log(`Response Time: ${responseTime}ms (Acceptable: ${isReliableResponseTime})`);
                console.log(`JSON Schema Valid: ${isDataFormatValid}`);
                
                if (res.statusCode === 200 && isReliableResponseTime && isDataFormatValid) {
                    console.log('Result: PASSED. Software reliability constraints met.');
                    resolve(true);
                } else {
                    console.error('Result: FAILED. API is unstable or non-compliant.');
                    resolve(false);
                }
            });
        }).on('error', (err) => {
            console.error(`Software Reliability Test Failed (Network Error): ${err.message}`);
            resolve(false);
        });
    });
}

// Export for integration into CI/CD pipelines
module.exports = { runReliabilityTest };
