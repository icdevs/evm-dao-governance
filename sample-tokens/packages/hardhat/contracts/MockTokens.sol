// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ICRC99Token.sol";

/**
 * @title MockUSDC
 * @dev Mock USDC token with realistic parameters for testing
 */
contract MockUSDC is ICRC99Token {
    constructor(address initialOwner) 
        ICRC99Token(
            "USD Coin (Mock)",
            "MUSDC",
            6, // USDC has 6 decimals
            1000000 * 10**6, // 1M USDC initial supply
            initialOwner
        ) {}
}

/**
 * @title MockUSDT
 * @dev Mock USDT token with realistic parameters for testing
 */
contract MockUSDT is ICRC99Token {
    constructor(address initialOwner) 
        ICRC99Token(
            "Tether USD (Mock)",
            "MUSDT",
            6, // USDT has 6 decimals
            2000000 * 10**6, // 2M USDT initial supply
            initialOwner
        ) {}
}

/**
 * @title MockDAI
 * @dev Mock DAI token with realistic parameters for testing
 */
contract MockDAI is ICRC99Token {
    constructor(address initialOwner) 
        ICRC99Token(
            "Dai Stablecoin (Mock)",
            "MDAI",
            18, // DAI has 18 decimals
            1500000 * 10**18, // 1.5M DAI initial supply
            initialOwner
        ) {}
}

/**
 * @title GovernanceToken
 * @dev Governance token for DAO voting scenarios
 */
contract GovernanceToken is ICRC99Token {
    constructor(address initialOwner) 
        ICRC99Token(
            "DAO Governance Token",
            "GOVTOKEN",
            18,
            10000000 * 10**18, // 10M tokens initial supply
            initialOwner
        ) {}
    
    /**
     * @dev Delegate voting power (simplified implementation)
     */
    mapping(address => address) public delegates;
    mapping(address => uint256) public delegatedVotes;
    
    event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);
    
    function delegate(address delegatee) public {
        address currentDelegate = delegates[msg.sender];
        
        if (currentDelegate != address(0)) {
            delegatedVotes[currentDelegate] -= balanceOf(msg.sender);
        }
        
        delegates[msg.sender] = delegatee;
        delegatedVotes[delegatee] += balanceOf(msg.sender);
        
        emit DelegateChanged(msg.sender, currentDelegate, delegatee);
    }
    
    function getVotingPower(address account) public view returns (uint256) {
        return balanceOf(account) + delegatedVotes[account];
    }
}
