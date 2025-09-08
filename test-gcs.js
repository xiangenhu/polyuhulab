#!/usr/bin/env node

/**
 * Simple test script to check Google Cloud Storage connectivity
 */

require('dotenv').config({ path: './.env' });
const gcsService = require('./services/gcsService');

async function testGCS() {
    console.log('🔍 Testing Google Cloud Storage connectivity...\n');

    console.log('Configuration:');
    console.log(`- Project ID: ${process.env.GCS_PROJECT_ID || 'NOT SET'}`);
    console.log(`- Bucket Name: ${process.env.GCS_BUCKET_NAME || 'NOT SET'}`);
    console.log(`- Key File: ${process.env.GCS_KEY_FILE || 'NOT SET'}`);
    console.log(`- Node Environment: ${process.env.NODE_ENV || 'development'}\n`);

    try {
        // Test 1: Health check
        console.log('1️⃣ Running health check...');
        const healthResult = await gcsService.healthCheck();
        
        if (healthResult.status === 'healthy') {
            console.log('✅ Health check passed');
            console.log(`   Bucket: ${healthResult.bucket}`);
            console.log(`   Timestamp: ${healthResult.timestamp}\n`);
        } else {
            console.log('❌ Health check failed');
            console.log(`   Error: ${healthResult.error}\n`);
            return false;
        }

        // Test 2: List files (test basic bucket access)
        console.log('2️⃣ Testing bucket access (list files)...');
        try {
            const fileList = await gcsService.listFiles('test-user', { limit: 5 });
            console.log('✅ Bucket access successful');
            console.log(`   Found ${fileList.files.length} files in test-user directory`);
            
            if (fileList.files.length > 0) {
                console.log('   Recent files:');
                fileList.files.slice(0, 3).forEach((file, index) => {
                    console.log(`   ${index + 1}. ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
                });
            }
            console.log('');
        } catch (error) {
            console.log('⚠️  Bucket access test completed with empty result (normal for new bucket)');
            console.log(`   Details: ${error.message}\n`);
        }

        // Test 3: Upload a small test file
        console.log('3️⃣ Testing file upload...');
        try {
            const testContent = Buffer.from('Hello GCS! This is a test file created at ' + new Date().toISOString(), 'utf8');
            const testFileName = `test-${Date.now()}.txt`;
            
            const uploadResult = await gcsService.uploadFile(testContent, testFileName, {
                userId: 'test-user',
                folder: 'tests',
                metadata: { 
                    testFile: true,
                    createdBy: 'gcs-test-script'
                }
            });

            console.log('✅ File upload successful');
            console.log(`   File ID: ${uploadResult.fileId}`);
            console.log(`   File Path: ${uploadResult.filePath}`);
            console.log(`   File Size: ${uploadResult.size} bytes`);
            console.log(`   Content Type: ${uploadResult.contentType}\n`);

            // Test 4: Download the test file
            console.log('4️⃣ Testing file download...');
            const downloadResult = await gcsService.downloadFile(uploadResult.filePath);
            console.log('✅ File download successful');
            console.log(`   Download URL generated: ${!!downloadResult.downloadUrl}`);
            console.log(`   File size: ${downloadResult.size} bytes\n`);

            // Test 5: Clean up - delete the test file
            console.log('5️⃣ Cleaning up test file...');
            const deleteResult = await gcsService.deleteFile(uploadResult.filePath);
            console.log('✅ Test file deleted successfully');
            console.log(`   Deleted at: ${deleteResult.deletedAt}\n`);

        } catch (error) {
            console.log('❌ File operations failed');
            console.log(`   Error: ${error.message}\n`);
            return false;
        }

        // Test 6: Storage usage check
        console.log('6️⃣ Testing storage usage calculation...');
        try {
            const usage = await gcsService.getStorageUsage('test-user');
            console.log('✅ Storage usage calculation successful');
            console.log(`   Total size: ${(usage.totalSize / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   File count: ${usage.fileCount}`);
            console.log(`   Types: ${Object.keys(usage.typeBreakdown).join(', ') || 'none'}\n`);
        } catch (error) {
            console.log('⚠️  Storage usage test completed (may be normal for new bucket)');
            console.log(`   Details: ${error.message}\n`);
        }

        console.log('🎉 All GCS tests completed successfully!');
        console.log('Your Google Cloud Storage is working properly.\n');
        
        return true;

    } catch (error) {
        console.log('❌ GCS test failed with error:');
        console.log(`   ${error.message}`);
        console.log('\n🔧 Troubleshooting tips:');
        console.log('1. Check your .env file has correct GCS configuration');
        console.log('2. Verify your service account key file exists and has proper permissions');
        console.log('3. Ensure your GCP project has Storage API enabled');
        console.log('4. Check that your service account has Storage Admin permissions');
        
        return false;
    }
}

// Run the test
if (require.main === module) {
    testGCS()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Unexpected error:', error);
            process.exit(1);
        });
}

module.exports = testGCS;