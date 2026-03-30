import React, { useEffect, useState } from 'react';

const FutureIncome = () => {
  const [forecast, _setForecast] = useState([]);

  useEffect(() => {
    // fetch("/api/future-income").then(res => res.json()).then(setForecast);
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Future Income</h2>
      <table className="min-w-full table-auto border-collapse border border-gray-300">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-4 py-2">Symbol</th>
            <th className="border px-4 py-2">Payment Date</th>
            <th className="border px-4 py-2">Forecast Amount</th>
          </tr>
        </thead>
        <tbody>
          {forecast.length === 0 ? (
            <tr><td colSpan="3" className="text-center py-4">No upcoming income</td></tr>
          ) : (
            forecast.map((row, i) => (
              <tr key={i}>
                <td className="border px-4 py-2">{row.symbol}</td>
                <td className="border px-4 py-2">{row.paymentDate}</td>
                <td className="border px-4 py-2">{row.amount}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default FutureIncome;
