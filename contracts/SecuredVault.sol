// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ZeroPay SecuredVault
/// @notice Per-employer salary vault on 0G Galileo testnet.
///         - owner   : employer's wallet (set at deploy time, can transfer ownership)
///         - operator: platform key     (executes payroll and transfers server-side)
///         Both owner and operator can deposit, withdraw, and run payroll.
///         Only the owner can change ownership or replace the operator.
contract SecuredVault {
    address public owner;
    address public operator;
    bool    private _locked;

    event Funded(address indexed from, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed to, uint256 amount, uint256 newBalance);
    event SalaryPaid(
        address indexed employee,
        uint256 amount,
        uint256 hoursWorked,
        uint256 periodStart,
        string  storageRef
    );
    event BatchSettled(
        uint256 totalPaid,
        uint256 employeeCount,
        uint256 periodStart,
        string  storageRef
    );
    event OwnershipTransferred(address indexed previous, address indexed next);
    event OperatorChanged(address indexed previous, address indexed next);

    modifier onlyOwner() {
        require(msg.sender == owner, "ZeroPay: not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == owner || msg.sender == operator,
            "ZeroPay: not authorized"
        );
        _;
    }

    modifier noReentrant() {
        require(!_locked, "ZeroPay: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    /// @param _owner    Employer's wallet — controls ownership and operator changes.
    /// @param _operator Platform key    — executes payroll and fund movements server-side.
    constructor(address _owner, address _operator) {
        require(_owner    != address(0), "ZeroPay: bad owner");
        require(_operator != address(0), "ZeroPay: bad operator");
        owner    = _owner;
        operator = _operator;
    }

    receive() external payable {
        require(msg.value > 0, "ZeroPay: zero amount");
        emit Funded(msg.sender, msg.value, address(this).balance);
    }

    function deposit() external payable {
        require(msg.value > 0, "ZeroPay: zero amount");
        emit Funded(msg.sender, msg.value, address(this).balance);
    }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    function withdraw(uint256 amount) external onlyAuthorized noReentrant {
        require(amount > 0,                            "ZeroPay: zero amount");
        require(amount <= address(this).balance,       "ZeroPay: insufficient vault");
        (bool ok, ) = payable(owner).call{value: amount}("");
        require(ok,                                    "ZeroPay: withdraw failed");
        emit Withdrawn(owner, amount, address(this).balance);
    }

    function paySalary(
        address employee,
        uint256 amount,
        uint256 hoursWorked,
        uint256 periodStart,
        string  calldata storageRef
    ) public onlyAuthorized noReentrant {
        require(employee != address(0),          "ZeroPay: bad address");
        require(amount > 0,                      "ZeroPay: zero amount");
        require(amount <= address(this).balance, "ZeroPay: insufficient vault");
        (bool ok, ) = payable(employee).call{value: amount}("");
        require(ok,                              "ZeroPay: transfer failed");
        emit SalaryPaid(employee, amount, hoursWorked, periodStart, storageRef);
    }

    function payBatch(
        address[] calldata employees,
        uint256[] calldata amounts,
        uint256[] calldata hoursWorkedArr,
        uint256            periodStart,
        string  calldata   storageRef
    ) external onlyAuthorized noReentrant {
        require(
            employees.length == amounts.length &&
            amounts.length   == hoursWorkedArr.length,
            "ZeroPay: length mismatch"
        );
        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) total += amounts[i];
        require(total <= address(this).balance, "ZeroPay: insufficient vault");

        for (uint256 i = 0; i < employees.length; i++) {
            require(employees[i] != address(0), "ZeroPay: bad address");
            (bool ok, ) = payable(employees[i]).call{value: amounts[i]}("");
            require(ok, "ZeroPay: transfer failed");
            emit SalaryPaid(employees[i], amounts[i], hoursWorkedArr[i], periodStart, storageRef);
        }
        emit BatchSettled(total, employees.length, periodStart, storageRef);
    }

    function transferOwnership(address next) external onlyOwner {
        require(next != address(0), "ZeroPay: bad address");
        emit OwnershipTransferred(owner, next);
        owner = next;
    }

    function setOperator(address next) external onlyOwner {
        require(next != address(0), "ZeroPay: bad address");
        emit OperatorChanged(operator, next);
        operator = next;
    }
}
