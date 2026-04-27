export const PAYROLL_POOL_ABI = [
  {
    "type": "constructor",
    "inputs": [
      { "name": "_owner",    "type": "address" },
      { "name": "_operator", "type": "address" }
    ],
    "stateMutability": "nonpayable"
  },
  { "type": "receive", "stateMutability": "payable" },
  {
    "type": "function", "name": "owner", "stateMutability": "view",
    "inputs": [], "outputs": [{ "name": "", "type": "address" }]
  },
  {
    "type": "function", "name": "operator", "stateMutability": "view",
    "inputs": [], "outputs": [{ "name": "", "type": "address" }]
  },
  {
    "type": "function", "name": "balance", "stateMutability": "view",
    "inputs": [], "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function", "name": "deposit", "stateMutability": "payable",
    "inputs": [], "outputs": []
  },
  {
    "type": "function", "name": "withdraw", "stateMutability": "nonpayable",
    "inputs": [{ "name": "amount", "type": "uint256" }], "outputs": []
  },
  {
    "type": "function", "name": "paySalary", "stateMutability": "nonpayable",
    "inputs": [
      { "name": "employee",    "type": "address" },
      { "name": "amount",      "type": "uint256" },
      { "name": "hoursWorked", "type": "uint256" },
      { "name": "periodStart", "type": "uint256" },
      { "name": "storageRef",  "type": "string"  }
    ],
    "outputs": []
  },
  {
    "type": "function", "name": "payBatch", "stateMutability": "nonpayable",
    "inputs": [
      { "name": "employees",     "type": "address[]" },
      { "name": "amounts",       "type": "uint256[]" },
      { "name": "hoursWorkedArr","type": "uint256[]" },
      { "name": "periodStart",   "type": "uint256"   },
      { "name": "storageRef",    "type": "string"    }
    ],
    "outputs": []
  },
  {
    "type": "function", "name": "transferOwnership", "stateMutability": "nonpayable",
    "inputs": [{ "name": "next", "type": "address" }], "outputs": []
  },
  {
    "type": "function", "name": "setOperator", "stateMutability": "nonpayable",
    "inputs": [{ "name": "next", "type": "address" }], "outputs": []
  },
  {
    "type": "event", "name": "Funded", "inputs": [
      { "indexed": true,  "name": "from",       "type": "address" },
      { "indexed": false, "name": "amount",     "type": "uint256" },
      { "indexed": false, "name": "newBalance", "type": "uint256" }
    ]
  },
  {
    "type": "event", "name": "Withdrawn", "inputs": [
      { "indexed": true,  "name": "to",         "type": "address" },
      { "indexed": false, "name": "amount",     "type": "uint256" },
      { "indexed": false, "name": "newBalance", "type": "uint256" }
    ]
  },
  {
    "type": "event", "name": "SalaryPaid", "inputs": [
      { "indexed": true,  "name": "employee",    "type": "address" },
      { "indexed": false, "name": "amount",      "type": "uint256" },
      { "indexed": false, "name": "hoursWorked", "type": "uint256" },
      { "indexed": false, "name": "periodStart", "type": "uint256" },
      { "indexed": false, "name": "storageRef",  "type": "string"  }
    ]
  },
  {
    "type": "event", "name": "BatchSettled", "inputs": [
      { "indexed": false, "name": "totalPaid",     "type": "uint256" },
      { "indexed": false, "name": "employeeCount", "type": "uint256" },
      { "indexed": false, "name": "periodStart",   "type": "uint256" },
      { "indexed": false, "name": "storageRef",    "type": "string"  }
    ]
  },
  {
    "type": "event", "name": "OwnershipTransferred", "inputs": [
      { "indexed": true, "name": "previous", "type": "address" },
      { "indexed": true, "name": "next",     "type": "address" }
    ]
  },
  {
    "type": "event", "name": "OperatorChanged", "inputs": [
      { "indexed": true, "name": "previous", "type": "address" },
      { "indexed": true, "name": "next",     "type": "address" }
    ]
  }
] as const;
