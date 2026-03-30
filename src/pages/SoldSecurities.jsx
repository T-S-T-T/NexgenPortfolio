import React, { useEffect, useState } from "react";
import {
  Typography,
  CircularProgress,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Tooltip,
  Stack,
  useTheme,
} from "@mui/material";
import {
  ArrowBack,
  Download,
} from "@mui/icons-material"; // ⬅️ Changed icon import
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";

const SoldSecurities = () => {
  const [securities, setSecurities] = useState([]);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        alert("You must be logged in.");
        return;
      }

      const { data: sellData } = await supabase
        .from("activities")
        .select(`
          id, type, date, quantity, price, total_amount, security_id, user_id,
          securities (symbol)
        `)
        .eq("type", "Sell")
        .eq("user_id", user.id);

      const { data: dividendData } = await supabase
        .from("activities")
        .select(`
          id, type, date, quantity, price, total_amount, security_id, user_id,
          securities (symbol)
        `)
        .eq("type", "Dividend")
        .eq("user_id", user.id);

      const dividendsMap = {};
      dividendData.forEach((div) => {
        const symbol = div.securities?.symbol || div.security_id;
        const amount = div.total_amount || ((div.quantity || 0) * (div.price || 0));
        dividendsMap[symbol] = (dividendsMap[symbol] || 0) + amount;
      });

      const reportMap = {};
      sellData.forEach((sell) => {
        const symbol = sell.securities?.symbol || sell.security_id;
        const quantity = Math.abs(sell.quantity || 0);
        const value = sell.total_amount || ((sell.quantity || 0) * (sell.price || 0));
        const capitalGain = value - 8; // Simplified logic

        if (!reportMap[symbol]) {
          reportMap[symbol] = { qty: 0, value: 0, capitalGain: 0 };
        }

        reportMap[symbol].qty += quantity;
        reportMap[symbol].value += value;
        reportMap[symbol].capitalGain += capitalGain;
      });

      const finalReport = Object.entries(reportMap).map(([symbol, data]) => {
        const dividend = dividendsMap[symbol] || 0;
        const totalReturn = data.capitalGain + dividend;
        return {
          symbol,
          qty: data.qty,
          capitalGain: data.capitalGain,
          dividend,
          return: totalReturn,
        };
      });

      setSecurities(finalReport);
      setLoading(false);
    };

    fetchReport();
  }, []);

  const totals = securities.reduce(
    (acc, s) => {
      acc.qty += s.qty;
      acc.capitalGain += s.capitalGain;
      acc.dividend += s.dividend;
      acc.return += s.return;
      return acc;
    },
    { qty: 0, capitalGain: 0, dividend: 0, return: 0 }
  );

  const exportToXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(securities);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sold Securities");
    XLSX.writeFile(wb, "sold_securities.xlsx");
  };

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
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
            Sold Securities
          </Typography>
        </Box>

        {/* Styled Download Icon */}
        <Stack direction="row" spacing={1}>
          <Tooltip title="Download as XLSX">
            <IconButton
              onClick={exportToXLSX}
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
        </Stack>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", my: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={3}>
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Symbol</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Capital Gains</TableCell>
                  <TableCell align="right">Dividends</TableCell>
                  <TableCell align="right">Return</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {securities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      No sold securities found.
                    </TableCell>
                  </TableRow>
                ) : (
                  securities.map((s, i) => (
                    <TableRow key={i} hover>
                      <TableCell>{s.symbol}</TableCell>
                      <TableCell align="right">{s.qty}</TableCell>
                      <TableCell align="right">${s.capitalGain.toFixed(2)}</TableCell>
                      <TableCell align="right">${s.dividend.toFixed(2)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        ${s.return.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {securities.length > 0 && (
                  <TableRow
                    sx={{
                      backgroundColor:
                        theme.palette.mode === "dark" ? "#1f1f1f" : "#e0e0e0",
                    }}
                  >
                    <TableCell><b>Grand Total</b></TableCell>
                    <TableCell align="right"><b>{totals.qty}</b></TableCell>
                    <TableCell align="right"><b>${totals.capitalGain.toFixed(2)}</b></TableCell>
                    <TableCell align="right"><b>${totals.dividend.toFixed(2)}</b></TableCell>
                    <TableCell align="right" sx={{ color: "success.light", fontWeight: 600 }}>
                      ${totals.return.toFixed(2)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default SoldSecurities;
