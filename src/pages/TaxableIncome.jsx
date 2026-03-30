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
  useTheme, // theme is used in sx prop later, so useTheme() call is fine
  IconButton,
  Tooltip,
} from "@mui/material";
import { ArrowBack, Download } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";

const TaxableIncome = () => {
  const [incomeRows, setIncomeRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const theme = useTheme(); // Keep useTheme as it's used in sx props

  useEffect(() => {
    const fetchDividendData = async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        console.error("User not logged in.");
        setLoading(false); // Set loading to false if user is not logged in
        return;
      }

      const { data, error } = await supabase
        .from("activities")
        .select(`
          id, date, total_amount, quantity, price, notes, security_id,
          securities (symbol)
        `)
        .eq("type", "Dividend")
        .eq("user_id", user.id);

      if (error) {
        console.error("Error fetching dividend data:", error);
        setLoading(false);
        return;
      }

      const formatted = data.map((row) => {
        // Corrected calculation for total
        let valueToParseTotal;
        if (row.total_amount != null) {
          valueToParseTotal = row.total_amount;
        } else if (row.quantity != null && row.price != null) {
          valueToParseTotal = row.quantity * row.price;
        } else {
          valueToParseTotal = 0; // Default to 0 if not enough data
        }
        const total = parseFloat(valueToParseTotal) || 0; // Ensure NaN becomes 0

        // Corrected calculation for franking (for robustness and consistency)
        const frankingValueString = row.notes?.match(/\d+(\.\d+)?/)?.[0];
        const franking = parseFloat(frankingValueString) || 0; // Ensure NaN becomes 0

        return {
          holding: row.securities?.symbol || row.security_id,
          paidDate: new Date(row.date).toLocaleDateString("en-AU", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          totalIncome: total,
          franked: total, // Assuming total income is fully franked as per original logic
          unfranked: 0,   // Assuming no unfranked part as per original logic
          withholdingTax: 0, // Assuming no withholding tax as per original logic
          frankingCredits: franking,
          grossIncome: total + franking,
        };
      });

      setIncomeRows(formatted);
      setLoading(false);
    };

    fetchDividendData();
  }, []); // Removed 'theme' from dependency array

  const total = (key) => incomeRows.reduce((sum, r) => sum + r[key], 0);

  const exportToExcel = () => {
    // Prepare data for export, ensuring numbers are formatted as numbers if needed
    const exportData = incomeRows.map(row => ({
      Holding: row.holding,
      "Paid Date": row.paidDate,
      "Total Income": row.totalIncome,
      "Franked": row.franked,
      "Unfranked": row.unfranked,
      "Withholding Tax": row.withholdingTax,
      "Franking Credits": row.frankingCredits,
      "Gross Income": row.grossIncome,
    }));

    // Add totals row for export
    if (incomeRows.length > 0) {
        exportData.push({
            Holding: "Total",
            "Paid Date": "",
            "Total Income": total("totalIncome"),
            "Franked": total("franked"),
            "Unfranked": total("unfranked"),
            "Withholding Tax": total("withholdingTax"),
            "Franking Credits": total("frankingCredits"),
            "Gross Income": total("grossIncome"),
        });
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "TaxableIncome");
    XLSX.writeFile(workbook, "TaxableIncomeReport.xlsx");
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
            Taxable Income
          </Typography>
        </Box>
        <Tooltip title="Download as XLSX">
          <IconButton onClick={exportToExcel} disabled={incomeRows.length === 0}>
            <Download />
          </IconButton>
        </Tooltip>
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
                  <TableCell>Holding</TableCell>
                  <TableCell>Paid Date</TableCell>
                  <TableCell align="right">Total Income</TableCell>
                  <TableCell align="right">Franked</TableCell>
                  <TableCell align="right">Unfranked</TableCell>
                  <TableCell align="right">Withholding Tax</TableCell>
                  <TableCell align="right">Franking Credits</TableCell>
                  <TableCell align="right">Gross Income</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {incomeRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      No income data available
                    </TableCell>
                  </TableRow>
                ) : (
                  incomeRows.map((row, i) => (
                    <TableRow key={i} hover>
                      <TableCell>{row.holding}</TableCell>
                      <TableCell>{row.paidDate}</TableCell>
                      <TableCell align="right">${row.totalIncome.toFixed(2)}</TableCell>
                      <TableCell align="right">${row.franked.toFixed(2)}</TableCell>
                      <TableCell align="right">${row.unfranked.toFixed(2)}</TableCell>
                      <TableCell align="right">${row.withholdingTax.toFixed(2)}</TableCell>
                      <TableCell align="right">${row.frankingCredits.toFixed(2)}</TableCell>
                      <TableCell align="right" style={{ color: theme.palette.success.main, fontWeight: 600 }}> {/* Used theme here */}
                        ${row.grossIncome.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}

                {incomeRows.length > 0 && (
                  <TableRow
                    sx={{ // theme is implicitly available here from useTheme() via the sx prop function signature
                      backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[200],
                      fontWeight: "bold",
                    }}
                  >
                    <TableCell><b>Total</b></TableCell>
                    <TableCell />
                    <TableCell align="right"><b>${total("totalIncome").toFixed(2)}</b></TableCell>
                    <TableCell align="right"><b>${total("franked").toFixed(2)}</b></TableCell>
                    <TableCell align="right"><b>${total("unfranked").toFixed(2)}</b></TableCell>
                    <TableCell align="right"><b>${total("withholdingTax").toFixed(2)}</b></TableCell>
                    <TableCell align="right"><b>${total("frankingCredits").toFixed(2)}</b></TableCell>
                    <TableCell align="right" sx={{ color: theme.palette.success.main, fontWeight: "bold" }}> {/* Used theme here */}
                      ${total("grossIncome").toFixed(2)}
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

export default TaxableIncome;