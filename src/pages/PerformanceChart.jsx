import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const portfolioValueData = [
  { date: "Jan 2020", value: 10000 },
  { date: "Jun 2020", value: 12000 },
  { date: "Jan 2021", value: 13500 },
  { date: "Jun 2021", value: 15000 },
  { date: "Jan 2022", value: 18000 },
  { date: "Jun 2022", value: 17000 },
  { date: "Jan 2023", value: 19000 },
  { date: "Jun 2023", value: 21000 },
  { date: "Jan 2024", value: 23000 },
  { date: "Jun 2024", value: 25000 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-md p-3 shadow-md bg-white text-black dark:bg-gray-800 dark:text-white">
        <p className="font-semibold">{label}</p>
        <p className="text-sm">Value: ${payload[0].value.toLocaleString()}</p>
      </div>
    );
  }
  return null;
};

const PerformanceChart = () => (
  <div className="bg-white dark:bg-[#0f172a] text-black dark:text-white p-8 rounded-2xl shadow-md">
    <h2 className="text-2xl font-semibold mb-6">Portfolio Value Over Time</h2>
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={portfolioValueData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" stroke="#6b7280" />
        <YAxis stroke="#6b7280" />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#6366f1"
          strokeWidth={3}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

export default PerformanceChart;
