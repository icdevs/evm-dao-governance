// This script will insert the duplicate voting test into the eth-transaction-execution.test.ts file
const fs = require('fs');
const path = require('path');

const testFilePath = path.join(__dirname, 'pic/main/eth-transaction-execution.test.ts');

// Read the file
let content = fs.readFileSync(testFilePath, 'utf8');

// Define the duplicate voting test code
const duplicateVoteTest = `
    // Step 3.1: Test duplicate voting prevention
    console.log("Step 3.1: Testing duplicate voting prevention...");
    
    // Try to vote again with the first voter (who already voted "Yes")
    const duplicateVoter = testVoters[0]; // First voter who already voted
    console.log(\`🔒 [SECURITY TEST] Attempting duplicate vote from voter: \${duplicateVoter.address}\`);
    
    try {
      // Generate SIWE proof for the duplicate vote attempt
      const duplicateSiweProof = await createSIWEProofForVote(
        duplicateVoter, 
        "vote", 
        governanceTokenAddress, 
        proposalId
      );
      
      // Get witness for duplicate vote attempt 
      console.log(\`🔍 [DUPLICATE] Generating witness for duplicate vote attempt...\`);
      const duplicateWitness = await generateTokenBalanceWitness(
        governanceTokenAddress,
        duplicateVoter.address,
        provider,
        await evmDAOBridge_fixture.actor.icrc149_get_proposal_snapshot_block(proposalId)
      );
      
      const duplicateVoteArgs: VoteArgs = {
        proposal_id: proposalId,
        voter: ethers.getBytes(duplicateVoter.address),
        choice: { No: null }, // Try to vote "No" this time (different from original "Yes")
        siwe: duplicateSiweProof,
        witness: duplicateWitness,
      };

      console.log(\`🔒 [SECURITY TEST] Submitting duplicate vote...\`);
      evmDAOBridge_fixture.actor.setIdentity(duplicateVoter.identity);
      
      const duplicateVoteResult = await executeWithRPCProcessing(
        () => evmDAOBridge_fixture.actor.icrc149_vote_proposal(duplicateVoteArgs),
        5, // max 5 rounds for duplicate vote attempt
        30000 // 30 second timeout per round
      );

      console.log(\`🔒 [SECURITY TEST] Duplicate vote result:\`, duplicateVoteResult);
      
      // The vote should be REJECTED
      if ('Ok' in duplicateVoteResult) {
        console.error(\`❌ [SECURITY FAILURE] Duplicate vote was ACCEPTED! This is a critical security bug.\`);
        throw new Error(\`CRITICAL SECURITY FAILURE: Duplicate vote from \${duplicateVoter.address} was accepted when it should have been rejected!\`);
      } else {
        console.log(\`✅ [SECURITY SUCCESS] Duplicate vote properly rejected with error:\`, duplicateVoteResult.Err);
        
        // Verify the error indicates duplicate voting
        const errorMessage = typeof duplicateVoteResult.Err === 'string' ? 
          duplicateVoteResult.Err : JSON.stringify(duplicateVoteResult.Err);
        
        if (errorMessage.toLowerCase().includes('already') || 
            errorMessage.toLowerCase().includes('duplicate') ||
            errorMessage.toLowerCase().includes('voted')) {
          console.log(\`✅ [SECURITY SUCCESS] Error message correctly indicates duplicate/already voted: "\${errorMessage}"\`);
        } else {
          console.log(\`⚠️ [SECURITY WARNING] Error message doesn't clearly indicate duplicate voting: "\${errorMessage}"\`);
          console.log(\`This might be a different error, but the vote was still rejected, which is correct.\`);
        }
      }
      
      // Verify vote tally hasn't changed after duplicate attempt
      console.log(\`🔍 [VERIFICATION] Checking vote tally after duplicate vote attempt...\`);
      evmDAOBridge_fixture.actor.setIdentity(admin);
      const tallyAfterDuplicate = await evmDAOBridge_fixture.actor.icrc149_tally_votes(proposalId);
      
      console.log("Vote tally after duplicate attempt:", {
        yes: tallyAfterDuplicate.yes.toString(),
        no: tallyAfterDuplicate.no.toString(),
        abstain: tallyAfterDuplicate.abstain.toString(),
        total: tallyAfterDuplicate.total.toString(),
        result: tallyAfterDuplicate.result
      });
      
      // Verify tallies are identical
      if (tallyAfterDuplicate.yes.toString() === tallyResult.yes.toString() &&
          tallyAfterDuplicate.no.toString() === tallyResult.no.toString() &&
          tallyAfterDuplicate.abstain.toString() === tallyResult.abstain.toString()) {
        console.log(\`✅ [SECURITY SUCCESS] Vote tallies unchanged after duplicate vote attempt\`);
      } else {
        throw new Error(\`CRITICAL SECURITY FAILURE: Vote tallies changed after duplicate vote attempt!\`);
      }
      
    } catch (error) {
      // If we get here and it's not our expected "duplicate vote rejected" scenario, 
      // then something went wrong with the test itself
      if (error instanceof Error && error.message.includes('CRITICAL SECURITY FAILURE')) {
        throw error; // Re-throw security failures
      }
      
      console.log(\`❌ [TEST ERROR] Error during duplicate vote test:\`, error);
      throw new Error(\`Duplicate vote test failed due to unexpected error: \${error instanceof Error ? error.message : error}\`);
    }
`;

// Find the insertion point - after the tally check and before Step 3.5
const insertionPattern = /(\s+\/\/ Expect the proposal to pass \(15,000 Yes vs 1,000 No\)\s+expect\(tallyResult\.yes > tallyResult\.no\)\.toBe\(true\);\s+expect\(tallyResult\.result\)\.toBe\("Passed"\);[^\n]*\n)(\s+\/\/ Step 3\.5: Advance time)/;

const match = content.match(insertionPattern);
if (match) {
  const beforeInsertion = match[1];
  const afterInsertion = match[2];
  
  // Insert the duplicate vote test
  const newContent = content.replace(insertionPattern, beforeInsertion + duplicateVoteTest + '\n' + afterInsertion);
  
  // Write back to file
  fs.writeFileSync(testFilePath, newContent, 'utf8');
  console.log('✅ Successfully inserted duplicate voting test into eth-transaction-execution.test.ts');
} else {
  console.log('❌ Could not find insertion point in the file');
  console.log('Looking for pattern around the vote tally check...');
  
  // Let's try a simpler pattern
  const simplePattern = /expect\(tallyResult\.result\)\.toBe\("Passed"\);[^\n]*\n/;
  const simpleMatch = content.match(simplePattern);
  if (simpleMatch) {
    const newContent = content.replace(simplePattern, simpleMatch[0] + duplicateVoteTest + '\n');
    fs.writeFileSync(testFilePath, newContent, 'utf8');
    console.log('✅ Successfully inserted duplicate voting test using simple pattern');
  } else {
    console.log('❌ Could not find even the simple pattern');
  }
}
