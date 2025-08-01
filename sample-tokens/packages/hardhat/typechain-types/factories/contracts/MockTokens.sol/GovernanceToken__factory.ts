/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import {
  Contract,
  ContractFactory,
  ContractTransactionResponse,
  Interface,
} from "ethers";
import type {
  Signer,
  AddressLike,
  ContractDeployTransaction,
  ContractRunner,
} from "ethers";
import type { NonPayableOverrides } from "../../../common";
import type {
  GovernanceToken,
  GovernanceTokenInterface,
} from "../../../contracts/MockTokens.sol/GovernanceToken";

const _abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "initialOwner",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "allowance",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "needed",
        type: "uint256",
      },
    ],
    name: "ERC20InsufficientAllowance",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "balance",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "needed",
        type: "uint256",
      },
    ],
    name: "ERC20InsufficientBalance",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "approver",
        type: "address",
      },
    ],
    name: "ERC20InvalidApprover",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "receiver",
        type: "address",
      },
    ],
    name: "ERC20InvalidReceiver",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "sender",
        type: "address",
      },
    ],
    name: "ERC20InvalidSender",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
    ],
    name: "ERC20InvalidSpender",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "OwnableInvalidOwner",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "OwnableUnauthorizedAccount",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "delegator",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "fromDelegate",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "toDelegate",
        type: "address",
      },
    ],
    name: "DelegateChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "Snapshot",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
    ],
    name: "allowance",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "snapshotId",
        type: "uint256",
      },
    ],
    name: "balanceOfAt",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "recipients",
        type: "address[]",
      },
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
    ],
    name: "batchMint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "delegatee",
        type: "address",
      },
    ],
    name: "delegate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "delegatedVotes",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "delegates",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "getVotingPower",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "mintTo",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "snapshot",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "snapshotId",
        type: "uint256",
      },
    ],
    name: "totalSupplyAt",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "transfer",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "transferFrom",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const _bytecode =
  "0x60806040523480156200001157600080fd5b506040516200152a3803806200152a8339810160408190526200003491620003ee565b6040518060400160405280601481526020017f44414f20476f7665726e616e636520546f6b656e0000000000000000000000008152506040518060400160405280600881526020016723a7ab2a27a5a2a760c11b81525060126a084595161401484a000000848085858160039081620000ae9190620004c6565b506004620000bd8282620004c6565b5050506001600160a01b038116620000f057604051631e4fbdf760e01b8152600060048201526024015b60405180910390fd5b620000fb816200012c565b506005805460ff60a01b1916600160a01b60ff8616021790556200012081836200017e565b505050505050620005ba565b600580546001600160a01b038381166001600160a01b0319831681179093556040519116919082907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e090600090a35050565b6001600160a01b038216620001aa5760405163ec442f0560e01b815260006004820152602401620000e7565b620001b860008383620001bc565b5050565b60085415620001fb576001600160a01b03831615620001e057620001e0836200024b565b6001600160a01b03821615620001fb57620001fb826200024b565b62000208838383620002bb565b60006008541180156200022a5750600854600090815260076020526040902054155b1562000246576002546008546000908152600760205260409020555b505050565b600060085411801562000281575060085460009081526006602090815260408083206001600160a01b0385168452909152902054155b15620002b8576001600160a01b03811660008181526020818152604080832054600854845260068352818420948452939091529020555b50565b6001600160a01b038316620002ea578060026000828254620002de919062000592565b909155506200035e9050565b6001600160a01b038316600090815260208190526040902054818110156200033f5760405163391434e360e21b81526001600160a01b03851660048201526024810182905260448101839052606401620000e7565b6001600160a01b03841660009081526020819052604090209082900390555b6001600160a01b0382166200037c576002805482900390556200039b565b6001600160a01b03821660009081526020819052604090208054820190555b816001600160a01b0316836001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef83604051620003e191815260200190565b60405180910390a3505050565b6000602082840312156200040157600080fd5b81516001600160a01b03811681146200041957600080fd5b9392505050565b634e487b7160e01b600052604160045260246000fd5b600181811c908216806200044b57607f821691505b6020821081036200046c57634e487b7160e01b600052602260045260246000fd5b50919050565b601f82111562000246576000816000526020600020601f850160051c810160208610156200049d5750805b601f850160051c820191505b81811015620004be57828155600101620004a9565b505050505050565b81516001600160401b03811115620004e257620004e262000420565b620004fa81620004f3845462000436565b8462000472565b602080601f831160018114620005325760008415620005195750858301515b600019600386901b1c1916600185901b178555620004be565b600085815260208120601f198616915b82811015620005635788860151825594840194600190910190840162000542565b5085821015620005825787850151600019600388901b60f8161c191681555b5050505050600190811b01905550565b80820180821115620005b457634e487b7160e01b600052601160045260246000fd5b92915050565b610f6080620005ca6000396000f3fe608060405234801561001057600080fd5b50600436106101375760003560e01c806370a08231116100b8578063981b24d01161007c578063981b24d0146102a2578063a9059cbb146102b5578063bb4d4436146102c8578063d364d4d4146102db578063dd62ed3e146102fb578063f2fde38b1461033457600080fd5b806370a0823114610250578063715018a6146102795780638da5cb5b1461028157806395d89b41146102925780639711715a1461029a57600080fd5b8063449a52f8116100ff578063449a52f8146101c15780634ee2cd7e146101d6578063587cde1e146101e95780635c19a95c1461022a578063685731071461023d57600080fd5b806306fdde031461013c578063095ea7b31461015a57806318160ddd1461017d57806323b872dd1461018f578063313ce567146101a2575b600080fd5b610144610347565b6040516101519190610c8e565b60405180910390f35b61016d610168366004610cf9565b6103d9565b6040519015158152602001610151565b6002545b604051908152602001610151565b61016d61019d366004610d23565b6103f3565b600554600160a01b900460ff1660405160ff9091168152602001610151565b6101d46101cf366004610cf9565b610417565b005b6101816101e4366004610cf9565b61042d565b6102126101f7366004610d5f565b6009602052600090815260409020546001600160a01b031681565b6040516001600160a01b039091168152602001610151565b6101d4610238366004610d5f565b6104da565b6101d461024b366004610dcd565b6105d5565b61018161025e366004610d5f565b6001600160a01b031660009081526020819052604090205490565b6101d4610687565b6005546001600160a01b0316610212565b61014461069b565b6101816106aa565b6101816102b0366004610e39565b6106fc565b61016d6102c3366004610cf9565b610784565b6101816102d6366004610d5f565b610792565b6101816102e9366004610d5f565b600a6020526000908152604090205481565b610181610309366004610e52565b6001600160a01b03918216600090815260016020908152604080832093909416825291909152205490565b6101d4610342366004610d5f565b6107bf565b60606003805461035690610e85565b80601f016020809104026020016040519081016040528092919081815260200182805461038290610e85565b80156103cf5780601f106103a4576101008083540402835291602001916103cf565b820191906000526020600020905b8154815290600101906020018083116103b257829003601f168201915b5050505050905090565b6000336103e78185856107fd565b60019150505b92915050565b60003361040185828561080f565b61040c85858561088d565b506001949350505050565b61041f6108ec565b6104298282610919565b5050565b60006008548211156104805760405162461bcd60e51b815260206004820152601760248201527614db985c1cda1bdd08191bd95cc81b9bdd08195e1a5cdd604a1b60448201526064015b60405180910390fd5b60008281526006602090815260408083206001600160a01b0387168452909152902054156104d1575060008181526006602090815260408083206001600160a01b03861684529091529020546103ed565b50600092915050565b336000908152600960205260409020546001600160a01b0316801561053757336000908152602081905260409020546001600160a01b0382166000908152600a602052604081208054909190610531908490610ed5565b90915550505b33600090815260096020908152604080832080546001600160a01b0319166001600160a01b038716179055908290529020546001600160a01b0383166000908152600a602052604081208054909190610591908490610ee8565b90915550506040516001600160a01b03808416919083169033907f3134e8a2e6d97e929a7e54011ea5485d7d196dd5f0ba4d4ef95803e8e3fc257f90600090a45050565b6105dd6108ec565b8281146106255760405162461bcd60e51b8152602060048201526016602482015275082e4e4c2f2e640d8cadccee8d040dad2e6dac2e8c6d60531b6044820152606401610477565b60005b838110156106805761067885858381811061064557610645610efb565b905060200201602081019061065a9190610d5f565b84848481811061066c5761066c610efb565b90506020020135610919565b600101610628565b5050505050565b61068f6108ec565b610699600061094f565b565b60606004805461035690610e85565b60006106b46108ec565b600880549060006106c483610f11565b90915550506008546040517f8030e83b04d87bef53480e26263266d6ca66863aa8506aca6f2559d18aa1cb6790600090a25060085490565b600060085482111561074a5760405162461bcd60e51b815260206004820152601760248201527614db985c1cda1bdd08191bd95cc81b9bdd08195e1a5cdd604a1b6044820152606401610477565b600082815260076020526040902054151580610764575081155b1561077c575060009081526007602052604090205490565b6002546103ed565b6000336103e781858561088d565b6001600160a01b0381166000908152600a6020908152604080832054918390528220546103ed9190610ee8565b6107c76108ec565b6001600160a01b0381166107f157604051631e4fbdf760e01b815260006004820152602401610477565b6107fa8161094f565b50565b61080a83838360016109a1565b505050565b6001600160a01b038381166000908152600160209081526040808320938616835292905220546000198114610887578181101561087857604051637dc7a0d960e11b81526001600160a01b03841660048201526024810182905260448101839052606401610477565b610887848484840360006109a1565b50505050565b6001600160a01b0383166108b757604051634b637e8f60e11b815260006004820152602401610477565b6001600160a01b0382166108e15760405163ec442f0560e01b815260006004820152602401610477565b61080a838383610a76565b6005546001600160a01b031633146106995760405163118cdaa760e01b8152336004820152602401610477565b6001600160a01b0382166109435760405163ec442f0560e01b815260006004820152602401610477565b61042960008383610a76565b600580546001600160a01b038381166001600160a01b0319831681179093556040519116919082907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e090600090a35050565b6001600160a01b0384166109cb5760405163e602df0560e01b815260006004820152602401610477565b6001600160a01b0383166109f557604051634a1406b160e11b815260006004820152602401610477565b6001600160a01b038085166000908152600160209081526040808320938716835292905220829055801561088757826001600160a01b0316846001600160a01b03167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92584604051610a6891815260200190565b60405180910390a350505050565b60085415610aae576001600160a01b03831615610a9657610a9683610af9565b6001600160a01b03821615610aae57610aae82610af9565b610ab9838383610b64565b6000600854118015610ada5750600854600090815260076020526040902054155b1561080a57600254600854600090815260076020526040902055505050565b6000600854118015610b2e575060085460009081526006602090815260408083206001600160a01b0385168452909152902054155b156107fa576001600160a01b03166000818152602081815260408083205460085484526006835281842094845293909152902055565b6001600160a01b038316610b8f578060026000828254610b849190610ee8565b90915550610c019050565b6001600160a01b03831660009081526020819052604090205481811015610be25760405163391434e360e21b81526001600160a01b03851660048201526024810182905260448101839052606401610477565b6001600160a01b03841660009081526020819052604090209082900390555b6001600160a01b038216610c1d57600280548290039055610c3c565b6001600160a01b03821660009081526020819052604090208054820190555b816001600160a01b0316836001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef83604051610c8191815260200190565b60405180910390a3505050565b60006020808352835180602085015260005b81811015610cbc57858101830151858201604001528201610ca0565b506000604082860101526040601f19601f8301168501019250505092915050565b80356001600160a01b0381168114610cf457600080fd5b919050565b60008060408385031215610d0c57600080fd5b610d1583610cdd565b946020939093013593505050565b600080600060608486031215610d3857600080fd5b610d4184610cdd565b9250610d4f60208501610cdd565b9150604084013590509250925092565b600060208284031215610d7157600080fd5b610d7a82610cdd565b9392505050565b60008083601f840112610d9357600080fd5b50813567ffffffffffffffff811115610dab57600080fd5b6020830191508360208260051b8501011115610dc657600080fd5b9250929050565b60008060008060408587031215610de357600080fd5b843567ffffffffffffffff80821115610dfb57600080fd5b610e0788838901610d81565b90965094506020870135915080821115610e2057600080fd5b50610e2d87828801610d81565b95989497509550505050565b600060208284031215610e4b57600080fd5b5035919050565b60008060408385031215610e6557600080fd5b610e6e83610cdd565b9150610e7c60208401610cdd565b90509250929050565b600181811c90821680610e9957607f821691505b602082108103610eb957634e487b7160e01b600052602260045260246000fd5b50919050565b634e487b7160e01b600052601160045260246000fd5b818103818111156103ed576103ed610ebf565b808201808211156103ed576103ed610ebf565b634e487b7160e01b600052603260045260246000fd5b600060018201610f2357610f23610ebf565b506001019056fea2646970667358221220b76f192b6e699775c229a3c45bfb829cd7098b83976c97bd9db0357561a75ce764736f6c63430008180033";

type GovernanceTokenConstructorParams =
  | [signer?: Signer]
  | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (
  xs: GovernanceTokenConstructorParams
): xs is ConstructorParameters<typeof ContractFactory> => xs.length > 1;

export class GovernanceToken__factory extends ContractFactory {
  constructor(...args: GovernanceTokenConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
  }

  override getDeployTransaction(
    initialOwner: AddressLike,
    overrides?: NonPayableOverrides & { from?: string }
  ): Promise<ContractDeployTransaction> {
    return super.getDeployTransaction(initialOwner, overrides || {});
  }
  override deploy(
    initialOwner: AddressLike,
    overrides?: NonPayableOverrides & { from?: string }
  ) {
    return super.deploy(initialOwner, overrides || {}) as Promise<
      GovernanceToken & {
        deploymentTransaction(): ContractTransactionResponse;
      }
    >;
  }
  override connect(runner: ContractRunner | null): GovernanceToken__factory {
    return super.connect(runner) as GovernanceToken__factory;
  }

  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): GovernanceTokenInterface {
    return new Interface(_abi) as GovernanceTokenInterface;
  }
  static connect(
    address: string,
    runner?: ContractRunner | null
  ): GovernanceToken {
    return new Contract(address, _abi, runner) as unknown as GovernanceToken;
  }
}
