import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  useTheme,
  Button,
  IconButton,
  Tooltip,
} from "@mui/material";
import { Treemap, ResponsiveContainer } from "recharts";
import { ArrowBack, Download } from "@mui/icons-material"; // ✅ updated icon import
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const PerformanceReport = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPerformanceData = async () => {
      setLoading(true);
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) return;

      const { data: activities, error } = await supabase
        .from("activities")
        .select(`
          id, user_id, type, quantity, price, fees, security_id,
          securities:security_id(symbol)
        `)
        .eq("user_id", userId);

      if (error || !activities) {
        console.error("Error fetching activities:", error);
        setLoading(false);
        return;
      }

      const performanceMap = {};

      activities.forEach((row) => {
        const symbol = row.securities?.symbol || "Unknown";
        if (!performanceMap[symbol]) {
          performanceMap[symbol] = {
            symbol,
            quantity: 0,
            capitalGains: 0,
            dividends: 0,
            price: 0,
            totalBuyCost: 0,
            totalSellValue: 0,
          };
        }

        const p = performanceMap[symbol];
        const qty = parseFloat(row.quantity || 0);
        const price = parseFloat(row.price || 0);
        const fees = parseFloat(row.fees || 0);

        if (row.type === "Buy") {
          p.quantity += qty;
          p.totalBuyCost += qty * price + fees;
          p.price = price;
        } else if (row.type === "Sell") {
          p.quantity -= qty;
          p.totalSellValue += qty * price - fees;
        } else if (row.type === "Dividend") {
          p.dividends += qty * price;
        }
      });

      const result = Object.values(performanceMap).map((p) => {
        const capitalGains = p.totalSellValue - p.totalBuyCost;
        const returnValue = capitalGains + p.dividends;
        return {
          ...p,
          capitalGains,
          return: returnValue,
          value: p.quantity * p.price,
        };
      });

      setData(result);
      setLoading(false);
    };

    fetchPerformanceData();
  }, []);

  const total = data.reduce(
    (acc, d) => {
      acc.value += d.value;
      acc.capitalGains += d.capitalGains;
      acc.dividends += d.dividends;
      acc.return += d.return;
      return acc;
    },
    { value: 0, capitalGains: 0, dividends: 0, return: 0 }
  );

  const chartColor = theme.palette.mode === "dark" ? "#42a5f5" : "#64b5f6";

  const renderCustomContent = (props) => {
    const { x, y, width, height, name, root, value } = props;
    const percent = ((value / root.value) * 100).toFixed(1);
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: chartColor,
            stroke: "#fff",
            strokeWidth: 1,
          }}
        />
        {width > 60 && height > 30 && (
          <>
            <text x={x + 6} y={y + 20} fontSize={14} fill="#fff" fontWeight="bold">
              {name}
            </text>
            <text x={x + 6} y={y + 38} fontSize={12} fill="#fff">
              {percent}%
            </text>
          </>
        )}
      </g>
    );
  };

  const exportToCSV = () => {
    const headers = ["Symbol", "Price", "Quantity", "Value", "Capital Gains", "Dividends", "Return"];
    const rows = data.map((r) => [
      r.symbol,
      r.price,
      r.quantity,
      r.value,
      r.capitalGains,
      r.dividends,
      r.return,
    ]);
    const csvContent = [headers, ...rows]
      .map((e) => e.join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "performance_report.csv");
    link.click();
  };

  return (
    <Box sx={{ p: 4 }}>
      {/* ✅ Header with back + export */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={() => navigate("/reports")}
            sx={{ mr: 2 }}
          >
            Back to Reports
          </Button>
          <Typography variant="h4" component="h1" fontWeight="bold">
            Performance
          </Typography>
        </Box>

        {/* ✅ Styled Export Icon */}
        <Tooltip title="Download as CSV">
          <IconButton
            onClick={exportToCSV}
            sx={{
              backgroundColor: "#90caf9",
              color: "#fff",
              '&:hover': {
                backgroundColor: "#64b5f6",
              },
              width: 48,
              height: 48,
              borderRadius: "50%",
            }}
          >
            <Download />
          </IconButton>
        </Tooltip>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", my: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Paper sx={{ mb: 4, p: 2 }}>
            <ResponsiveContainer width="100%" height={300}>
              <Treemap
                data={data.map((d) => ({ name: d.symbol, size: Math.abs(d.return) }))}
                dataKey="size"
                nameKey="name"
                stroke="#fff"
                fill={chartColor}
                content={renderCustomContent}
              />
            </ResponsiveContainer>
          </Paper>

          <Paper elevation={3}>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>ASX</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Quantity</TableCell>
                    <TableCell align="right">Value</TableCell>
                    <TableCell align="right">Capital Gains</TableCell>
                    <TableCell align="right">Dividends</TableCell>
                    <TableCell align="right">Return</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.map((row, i) => (
                    <TableRow key={i} hover>
                      <TableCell>{row.symbol}</TableCell>
                      <TableCell align="right">${row.price.toFixed(2)}</TableCell>
                      <TableCell align="right">{row.quantity}</TableCell>
                      <TableCell align="right">${row.value.toFixed(2)}</TableCell>
                      <TableCell align="right">${row.capitalGains.toFixed(2)}</TableCell>
                      <TableCell align="right">${row.dividends.toFixed(2)}</TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          color: row.return < 0 ? "error.main" : "success.light",
                          fontWeight: 600,
                        }}
                      >
                        ${row.return.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow
                    sx={{
                      backgroundColor: theme.palette.mode === "dark" ? "#151515" : "#f5f5f5",
                    }}
                  >
                    <TableCell><b>Grand Total</b></TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell align="right"><b>${total.value.toFixed(2)}</b></TableCell>
                    <TableCell align="right"><b>${total.capitalGains.toFixed(2)}</b></TableCell>
                    <TableCell align="right"><b>${total.dividends.toFixed(2)}</b></TableCell>
                    <TableCell align="right" sx={{ color: "success.light", fontWeight: 600 }}>
                      ${total.return.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default PerformanceReport;
