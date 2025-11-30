# Integration Testing Workflow

## Complete End-to-End Testing Flow

### Phase 1: Component Verification

#### Backend Ownership Service Test
```javascript
// Test ownership verification
const testOwnershipVerification = async () => {
  const walletAddress = "0x1234567890123456789012345678901234567890";
  const tileId = 15; // Tile in 8x8 grid (position [1,7])
  
  try {
    const isOwner = await ownershipService.verifyTileOwnership(tileId, walletAddress);
    console.log(`Ownership verification for tile ${tileId}:`, isOwner);
    
    if (isOwner) {
      console.log("✅ Ownership verification passed");
      return true;
    } else {
      console.log("❌ Ownership verification failed");
      return false;
    }
  } catch (error) {
    console.error("Ownership verification error:", error);
    return false;
  }
};
```

#### ESP32 Connectivity Test
```javascript
// Test ESP32 health and connectivity
const testESP32Connectivity = async () => {
  const esp32Service = new ESP32CommunicationService({
    host: 'http://192.168.1.100',
    port: 80
  });

  try {
    const health = await esp32Service.checkESP32Health();
    console.log("ESP32 Health:", health);
    
    if (health.status === 'healthy') {
      console.log("✅ ESP32 is responsive");
      return true;
    } else {
      console.log("❌ ESP32 health check failed");
      return false;
    }
  } catch (error) {
    console.error("ESP32 connectivity error:", error);
    return false;
  }
};
```

### Phase 2: Integration Flow Testing

#### Complete Tile Update Workflow
```javascript
// Test complete workflow: Ownership → Backend → ESP32 → LED
const testCompleteWorkflow = async () => {
  console.log("Starting complete workflow test...");
  
  const testData = {
    walletAddress: "0x1234567890123456789012345678901234567890",
    tileId: 15,
    color: "#FF5733", // Orange color
    tokenId: 15
  };

  // Step 1: Verify NFT ownership
  console.log("Step 1: Verifying NFT ownership...");
  const ownershipProof = {
    walletAddress: testData.walletAddress,
    tokenId: testData.tokenId,
    signature: "mock_signature_for_testing"
  };
  
  const isOwner = await ownershipService.verifyTileOwnership(
    testData.tileId, 
    ownershipProof
  );
  
  if (!isOwner) {
    console.log("❌ Ownership verification failed");
    return false;
  }
  console.log("✅ Ownership verified");

  // Step 2: Send update to ESP32
  console.log("Step 2: Sending color update to ESP32...");
  const esp32Service = new ESP32CommunicationService();
  
  const updateResult = await esp32Service.updateTileColor(
    testData.tileId,
    testData.color,
    ownershipProof
  );

  if (!updateResult.success) {
    console.log("❌ ESP32 update failed:", updateResult.error);
    return false;
  }
  console.log("✅ ESP32 update successful");

  // Step 3: Verify LED display
  console.log("Step 3: Verifying LED display...");
  // Visual verification or sensor feedback would be implemented here
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for LED update
  
  console.log("✅ Complete workflow test passed");
  return true;
};
```

### Phase 3: Batch Operations Testing

#### Multiple Tile Updates
```javascript
// Test batch tile updates for performance
const testBatchUpdates = async () => {
  const batchData = [
    { tileId: 0, color: "#FF0000", walletAddress: "0x1111..." },
    { tileId: 1, color: "#00FF00", walletAddress: "0x2222..." },
    { tileId: 2, color: "#0000FF", walletAddress: "0x3333..." },
    { tileId: 3, color: "#FFFF00", walletAddress: "0x4444..." }
  ];

  console.log("Testing batch updates...");
  const startTime = Date.now();
  
  const promises = batchData.map(async (data) => {
    const ownershipProof = {
      walletAddress: data.walletAddress,
      tokenId: data.tileId
    };
    
    return await esp32Service.updateTileColor(
      data.tileId,
      data.color,
      ownershipProof
    );
  });

  const results = await Promise.allSettled(promises);
  const endTime = Date.now();
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
  const failed = results.filter(r => r.status === 'rejected' || !r.value?.success);
  
  console.log(`Batch update results:`);
  console.log(`✅ Successful: ${successful.length}/${batchData.length}`);
  console.log(`❌ Failed: ${failed.length}/${batchData.length}`);
  console.log(`⏱️ Total time: ${endTime - startTime}ms`);
  
  return successful.length === batchData.length;
};
```

### Phase 4: Error Handling Testing

#### Network Failure Simulation
```javascript
// Test system behavior during network issues
const testNetworkFailure = async () => {
  console.log("Testing network failure scenarios...");
  
  const esp32Service = new ESP32CommunicationService({
    host: 'http://192.168.1.999', // Invalid IP to simulate failure
    port: 80
  });

  try {
    const result = await esp32Service.updateTileColor(
      10, 
      "#FFFFFF",
      { walletAddress: "0x1234...", tokenId: 10 }
    );
    
    // Should handle gracefully
    if (!result.success && result.error.includes('network')) {
      console.log("✅ Network failure handled gracefully");
      return true;
    }
  } catch (error) {
    console.log("✅ Network error caught and handled:", error.message);
    return true;
  }
  
  console.log("❌ Network failure not handled properly");
  return false;
};
```

#### Invalid Data Handling
```javascript
// Test invalid input handling
const testInvalidData = async () => {
  const invalidTestCases = [
    { tileId: -1, color: "#FF0000", expected: "Invalid tile ID" },
    { tileId: 64, color: "#FF0000", expected: "Tile ID out of range" },
    { tileId: 10, color: "invalid_color", expected: "Invalid color format" },
    { tileId: 10, color: "#FF0000", walletAddress: "", expected: "Invalid wallet" }
  ];

  for (const testCase of invalidTestCases) {
    try {
      const result = await esp32Service.updateTileColor(
        testCase.tileId,
        testCase.color,
        { walletAddress: testCase.walletAddress || "0x1234...", tokenId: testCase.tileId }
      );
      
      if (!result.success) {
        console.log(`✅ Invalid data rejected: ${testCase.expected}`);
      } else {
        console.log(`❌ Invalid data accepted: ${testCase.expected}`);
        return false;
      }
    } catch (error) {
      console.log(`✅ Invalid data error caught: ${error.message}`);
    }
  }
  
  return true;
};
```

### Phase 5: Performance Testing

#### Load Testing
```javascript
// Test system under load
const testSystemLoad = async () => {
  console.log("Starting load test...");
  
  const concurrentUsers = 10;
  const updatesPerUser = 5;
  const startTime = Date.now();
  
  const userPromises = Array.from({ length: concurrentUsers }, async (_, userIndex) => {
    const userResults = [];
    
    for (let i = 0; i < updatesPerUser; i++) {
      const tileId = (userIndex * updatesPerUser + i) % 64;
      const color = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
      
      try {
        const result = await esp32Service.updateTileColor(
          tileId,
          color,
          { walletAddress: `0x${userIndex.toString(16).padStart(40, '0')}`, tokenId: tileId }
        );
        userResults.push(result.success);
      } catch (error) {
        userResults.push(false);
      }
    }
    
    return userResults;
  });

  const allResults = await Promise.all(userPromises);
  const endTime = Date.now();
  
  const totalUpdates = concurrentUsers * updatesPerUser;
  const successfulUpdates = allResults.flat().filter(success => success).length;
  const avgResponseTime = (endTime - startTime) / totalUpdates;
  
  console.log(`Load test results:`);
  console.log(`Total updates: ${totalUpdates}`);
  console.log(`Successful: ${successfulUpdates}`);
  console.log(`Success rate: ${(successfulUpdates / totalUpdates * 100).toFixed(2)}%`);
  console.log(`Average response time: ${avgResponseTime.toFixed(2)}ms`);
  
  return successfulUpdates / totalUpdates >= 0.95; // 95% success rate threshold
};
```

## Test Execution Script

```javascript
// main_test.js - Complete integration test suite
const runIntegrationTests = async () => {
  console.log("🚀 Starting Integration Test Suite");
  console.log("=====================================");
  
  const testResults = {
    ownership: await testOwnershipVerification(),
    connectivity: await testESP32Connectivity(),
    workflow: await testCompleteWorkflow(),
    batch: await testBatchUpdates(),
    networkFailure: await testNetworkFailure(),
    invalidData: await testInvalidData(),
    load: await testSystemLoad()
  };
  
  console.log("\n📊 Test Results Summary:");
  console.log("========================");
  
  Object.entries(testResults).forEach(([test, result]) => {
    const status = result ? "✅ PASS" : "❌ FAIL";
    console.log(`${test.padEnd(20)} ${status}`);
  });
  
  const totalTests = Object.keys(testResults).length;
  const passedTests = Object.values(testResults).filter(r => r).length;
  const successRate = (passedTests / totalTests * 100).toFixed(2);
  
  console.log(`\nOverall Success Rate: ${successRate}% (${passedTests}/${totalTests})`);
  
  if (passedTests === totalTests) {
    console.log("🎉 All tests passed! System ready for production.");
  } else {
    console.log("⚠️ Some tests failed. Review and fix issues before deployment.");
  }
  
  return passedTests === totalTests;
};

// Run the tests
runIntegrationTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error("Test suite error:", error);
  process.exit(1);
});
```