import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "../lib/supabase";
import {
  Box,
  Typography,
  Button,
  Stack,
  Paper,
  useTheme,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import dayjs from "dayjs";
import groupBy from "lodash.groupby";
import { useNavigate } from "react-router-dom";

const PerformancePage = () => {
  const [snapshots, setSnapshots] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [granularity, setGranularity] = useState("1D");
  const [selectedBroker, setSelectedBroker] = useState("All Brokers");
  const [availableBrokers, setAvailableBrokers] = useState([]);

  const theme = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSnapshots = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("portfolio_snapshots")
        .select("date, total_value, broker")
        .eq("user_id", user.id)
        .order("date", { ascending: true });

      if (error) {
        console.error("Fetch error:", error);
        return;
      }

      setSnapshots(
        data.map((row) => ({
          date: row.date,
          value: parseFloat(row.total_value),
          broker: row.broker,
        }))
      );

      const predefined = [
        "180 Markets",
        "708 Wealth Management",
        "Alpine Capital",
        "ASR Wealth Advisers",
        "CommSec",
        "eToro",
        "HSBC Australia",
        "Moomoo",
        "NAB Trade",
        "Stake",
        "Superhero",
      ];
      setAvailableBrokers(["All Brokers", ...predefined]);
    };

    fetchSnapshots();
  }, []);

  useEffect(() => {
    if (!snapshots.length) return;

    const byBroker =
      selectedBroker === "All Brokers"
        ? snapshots
        : snapshots.filter((s) => s.broker === selectedBroker);

    if (granularity === "1D") {
      const lastDate = dayjs(byBroker.slice(-1)[0]?.date).startOf("day");
      setFilteredData(byBroker.filter((s) =>
        dayjs(s.date).isSame(lastDate, "day")
      ));
      return;
    }

    let grouped;
    if (granularity === "1W") {
      grouped = groupBy(byBroker, (s) =>
        dayjs(s.date).startOf("week").format("YYYY-MM-DD")
      );
    } else if (granularity === "1M") {
      grouped = groupBy(byBroker, (s) =>
        dayjs(s.date).format("YYYY-MM")
      );
    } else if (granularity === "1Y") {
      grouped = groupBy(byBroker, (s) =>
        dayjs(s.date).format("YYYY")
      );
    } else {
      setFilteredData(byBroker);
      return;
    }

    setFilteredData(
      Object.entries(grouped).map(([period, entries]) => {
        const avg =
          entries.reduce((sum, d) => sum + d.value, 0) / entries.length;
        return { date: period, value: parseFloat(avg.toFixed(2)) };
      })
    );
  }, [snapshots, granularity, selectedBroker]);

  const total = filteredData.reduce((sum, d) => sum + d.value, 0);
  const start = filteredData[0]?.value || 0;
  const change = total - start;
  const pct = start ? (change / start) * 100 : 0;

  // if no data, show a single zero‐point so axes still draw
  const plotData =
    filteredData.length > 0
      ? filteredData
      : [{ date: dayjs(snapshots.slice(-1)[0]?.date).format("YYYY-MM-DD"), value: 0 }];

  return (
    <Box
      sx={{
        padding: 4,
        minHeight: "100vh",
        backgroundColor: "background.default",
        color: "text.primary",
      }}
    >
      <Box sx={{ mb: 2 }}>
        <Button variant="outlined" onClick={() => navigate("/reports")}>
          ← Back to Reports
        </Button>
      </Box>

      <Typography variant="h4" gutterBottom>
        Brokers Performance
      </Typography>

      <FormControl sx={{ mb: 2, minWidth: 220 }} size="small">
        <InputLabel>Select Broker</InputLabel>
        <Select
          value={selectedBroker}
          label="Select Broker"
          onChange={(e) => setSelectedBroker(e.target.value)}
        >
          {availableBrokers.map((b) => (
            <MenuItem key={b} value={b}>
              {b}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Paper
        elevation={3}
        sx={{
          backgroundColor: "background.paper",
          padding: 4,
          borderRadius: 3,
          width: "100%",
        }}
      >
        <Typography variant="h5" gutterBottom>
          {granularity === "1D"
            ? "Today's Total: "
            : granularity === "1W"
            ? "This Week's Total: "
            : granularity === "1M"
            ? "This Month's Total: "
            : granularity === "1Y"
            ? "This Year's Total: "
            : "Total: "}
          ${total.toFixed(2)}
        </Typography>

        <Typography sx={{ color: change >= 0 ? "#4caf50" : "#f44336" }}>
          {change.toFixed(2)} {change >= 0 ? "↑" : "↓"} {pct.toFixed(2)}%
        </Typography>

        <Box sx={{ overflowX: "auto", mt: 3 }}>
          <Box sx={{ width: "1150px" }}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={plotData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis
                  dataKey="date"
                  stroke="#aaa"
                  tickFormatter={(t) =>
                    granularity === "1Y"
                      ? dayjs(t).format("YYYY")
                      : granularity === "1M"
                      ? dayjs(t).format("MMM YYYY")
                      : dayjs(t).format("MMM D")
                  }
                  minTickGap={20}
                />
                <YAxis
                  stroke="#aaa"
                  domain={[0, "auto"]}
                  label={{
                    value: "Total Value",
                    angle: -90,
                    position: "insideLeft",
                    dx: -5,
                    style: {
                      textAnchor: "middle",
                      fill: "#aaa",
                      fontSize: 14,
                    },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                    color: theme.palette.text.primary,
                  }}
                  labelStyle={{ color: theme.palette.text.secondary }}
                  formatter={(v) => [`$${v.toFixed(2)}`, "Value"]}
                  labelFormatter={(lbl) =>
                    `Date: ${dayjs(lbl).format("YYYY-MM-DD")}`
                  }
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={theme.palette.primary.main}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        <Stack direction="row" spacing={2} justifyContent="center" mt={3}>
          {["1D", "1W", "1M", "1Y", "ALL"].map((r) => (
            <Button
              key={r}
              variant={granularity === r ? "contained" : "outlined"}
              color="primary"
              size="small"
              onClick={() => setGranularity(r)}
            >
              {r}
            </Button>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
};

export default PerformancePage;
