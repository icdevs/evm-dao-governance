// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ICRC99Token
 * @dev Base ERC-20 token with additional functionality for ICRC-99 compatibility
 * Includes snapshot capabilities and realistic distribution patterns
 */
contract ICRC99Token is ERC20, Ownable {
    uint8 private _decimals;
    
    // Snapshot functionality
    mapping(uint256 => mapping(address => uint256)) private _snapshots;
    mapping(uint256 => uint256) private _snapshotTotalSupply;
    uint256 private _currentSnapshotId;
    
    event Snapshot(uint256 indexed id);
    
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        uint256 initialSupply,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        _decimals = decimals_;
        _mint(initialOwner, initialSupply);
    }
    
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
    
    /**
     * @dev Creates a new snapshot and returns its identifier
     */
    function snapshot() public onlyOwner returns (uint256) {
        _currentSnapshotId++;
        
        // Record current state for all addresses that have balances
        // Note: This is a simplified implementation. In production, you'd use 
        // OpenZeppelin's ERC20Snapshot for gas efficiency
        
        emit Snapshot(_currentSnapshotId);
        return _currentSnapshotId;
    }
    
    /**
     * @dev Internal function to record balance at snapshot time
     */
    function _recordSnapshot(address account) internal {
        if (_currentSnapshotId > 0 && _snapshots[_currentSnapshotId][account] == 0) {
            _snapshots[_currentSnapshotId][account] = balanceOf(account);
        }
    }
    
    /**
     * @dev Get balance at a specific snapshot
     */
    function balanceOfAt(address account, uint256 snapshotId) public view returns (uint256) {
        require(snapshotId <= _currentSnapshotId, "Snapshot does not exist");
        
        // Return the snapshot balance if it exists, otherwise current balance
        if (_snapshots[snapshotId][account] > 0) {
            return _snapshots[snapshotId][account];
        }
        
        // If no snapshot balance recorded, return 0 (snapshot was taken before this account had any tokens)
        return 0;
    }
    
    /**
     * @dev Get total supply at a specific snapshot
     */
    function totalSupplyAt(uint256 snapshotId) public view returns (uint256) {
        require(snapshotId <= _currentSnapshotId, "Snapshot does not exist");
        
        if (_snapshotTotalSupply[snapshotId] > 0 || snapshotId == 0) {
            return _snapshotTotalSupply[snapshotId];
        }
        
        return totalSupply();
    }
    
    /**
     * @dev Mint tokens to specified addresses (for testing distributions)
     */
    function mintTo(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
    
    /**
     * @dev Batch mint to multiple addresses
     */
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) public onlyOwner {
        require(recipients.length == amounts.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }
    }
    
    // Override transfer functions to update snapshots
    function _update(address from, address to, uint256 value) internal virtual override {
        // Record snapshots before the transfer if we have an active snapshot
        if (_currentSnapshotId > 0) {
            if (from != address(0)) {
                _recordSnapshot(from);
            }
            if (to != address(0)) {
                _recordSnapshot(to);
            }
        }
        
        super._update(from, to, value);
        
        // Update total supply snapshot
        if (_currentSnapshotId > 0 && _snapshotTotalSupply[_currentSnapshotId] == 0) {
            _snapshotTotalSupply[_currentSnapshotId] = totalSupply();
        }
    }
}
