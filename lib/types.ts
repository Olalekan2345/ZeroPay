export type Employee = {
  id: string;
  name: string;
  wallet: `0x${string}`;
  hourlyRate: number; // in 0G per hour, e.g. 0.01
  createdAt: number;
  storageRef?: string; // 0G Storage reference
};

export type AttendanceEntry = {
  id: string;
  employeeId: string;
  clockIn: number; // unix ms
  clockOut: number | null;
  storageRef?: string;
};

export type PayrollLine = {
  employeeId: string;
  employeeName: string;
  wallet: `0x${string}`;
  hoursWorked: number;
  hourlyRate: number;
  amount: number; // in 0G (float)
  amountWei: string; // stringified bigint
};

export type PayrollReport = {
  weekStart: number; // unix ms, Monday 00:00
  weekEnd: number; // unix ms, Sunday 23:59
  generatedAt: number;
  lines: PayrollLine[];
  totalPaid: number;
  totalPaidWei: string;
  poolBalanceWei: string;
  sufficient: boolean;
  warnings: string[];
  storageRef?: string;
  txHash?: string;
};
