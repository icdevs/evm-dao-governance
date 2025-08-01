Make domain a config variable? https://dao-voting.example.com
Quorum
Remove treasury from total votes.
Add Eth addresses as proposers.
Add ABI reverse look up and interpretation to proposal listing on dapp.
Implement icrc105 config changes
Implement Icrcstate changes for sending ethtransactions
✅ Add function to update proposal duration (COMPLETED - Using Nat for nanoseconds)
  - ✅ Added icrc149_update_proposal_duration function that accepts duration_nanoseconds: Nat  
  - ✅ For testing: script can now set 5-minute proposal duration (300,000,000,000 nanoseconds)
  - ✅ Proposal duration stored as nanoseconds for precision (field name kept for migration compatibility)
  - ✅ Uses ExtendedProposalEngine Duration #nanoseconds variant instead of #days
  - ✅ Admin-only function with proper validation (max 365 days = 31,536,000,000,000,000 nanoseconds)