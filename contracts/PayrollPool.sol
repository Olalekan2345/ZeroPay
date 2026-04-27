// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ZeroPay PayrollPool
/// @notice Employer-funded pool on 0G Galileo testnet. Only the employer (owner)
///         can deposit, withdraw, or trigger salary payments. All payouts are
///         deducted from the pool balance. Intended to be driven by the ZeroPay
///         AI payroll agent on a weekly schedule.
contract PayrollPool {
    address public employer;

    event Deposited(address indexed from, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed to, uint256 amount, uint256 newBalance);
    event SalaryPaid(
        address indexed employee,
        uint256 amount,
        uint256 hoursWorked,
        uint256 weekStart,
        string storageRef
    );
    event BatchSettled(uint256 totalPaid, uint256 employeeCount, uint256 weekStart, string storageRef);
    event EmployerTransferred(address indexed previous, address indexed next);

    modifier onlyEmployer() {
        require(msg.sender == employer, "ZeroPay: not employer");
        _;
    }

    constructor() {
        employer = msg.sender;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value, address(this).balance);
    }

    function deposit() external payable {
        require(msg.value > 0, "ZeroPay: zero deposit");
        emit Deposited(msg.sender, msg.value, address(this).balance);
    }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    function withdraw(uint256 amount) external onlyEmployer {
        require(amount <= address(this).balance, "ZeroPay: insufficient pool");
        (bool ok, ) = payable(employer).call{value: amount}("");
        require(ok, "ZeroPay: withdraw failed");
        emit Withdrawn(employer, amount, address(this).balance);
    }

    /// @notice Pay a single employee. Emits a SalaryPaid event including a
    ///         0G Storage content reference for the attendance record backing
    ///         this payment.
    function paySalary(
        address employee,
        uint256 amount,
        uint256 hoursWorked,
        uint256 weekStart,
        string calldata storageRef
    ) public onlyEmployer {
        require(employee != address(0), "ZeroPay: bad employee");
        require(amount > 0, "ZeroPay: zero amount");
        require(amount <= address(this).balance, "ZeroPay: insufficient pool");
        (bool ok, ) = payable(employee).call{value: amount}("");
        require(ok, "ZeroPay: transfer failed");
        emit SalaryPaid(employee, amount, hoursWorked, weekStart, storageRef);
    }

    /// @notice Pay many employees at once. Reverts if any single payment would
    ///         overdraw the pool; the agent pre-checks before calling.
    function payBatch(
        address[] calldata employees,
        uint256[] calldata amounts,
        uint256[] calldata hoursWorkedArr,
        uint256 weekStart,
        string calldata storageRef
    ) external onlyEmployer {
        require(
            employees.length == amounts.length && amounts.length == hoursWorkedArr.length,
            "ZeroPay: length mismatch"
        );
        uint256 total;
        for (uint256 i = 0; i < employees.length; i++) {
            total += amounts[i];
        }
        require(total <= address(this).balance, "ZeroPay: insufficient pool");

        for (uint256 i = 0; i < employees.length; i++) {
            paySalary(employees[i], amounts[i], hoursWorkedArr[i], weekStart, storageRef);
        }
        emit BatchSettled(total, employees.length, weekStart, storageRef);
    }

    function transferEmployer(address next) external onlyEmployer {
        require(next != address(0), "ZeroPay: bad address");
        emit EmployerTransferred(employer, next);
        employer = next;
    }
}
