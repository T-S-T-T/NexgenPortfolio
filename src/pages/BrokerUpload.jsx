import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Box, Container, Typography, Paper, Button, Breadcrumbs, Divider,
  Snackbar, Alert, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle, Grid, Select,
  MenuItem, FormControl, InputLabel, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Link as MuiLink
} from "@mui/material";
import { ArrowBack, HomeOutlined, DeleteOutline, Refresh } from "@mui/icons-material"; // Added Refresh
import { styled } from "@mui/material/styles";
import BrokerCSVUploader from "../components/BrokerCSVUploader";
import { supabase } from "../lib/supabase";
import TransactionTable from "../components/TransactionTable";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useAuth } from "../contexts/AuthContext"; // To get current user for data filtering

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  borderRadius: theme.shape.borderRadius * 1.5,
  boxShadow: theme.shadows[2],
  transition: "box-shadow 0.3s ease-in-out",
  marginBottom: theme.spacing(3),
  "&:hover": {
    boxShadow: theme.shadows[4],
  },
}));

const brokerNameMap = {
  "180markets": "180 Markets", "708wealth": "708 Wealth Management",
  "alpine": "Alpine Capital", "asr": "ASR Wealth Advisers",
  "hsbc": "HSBC Australia", // Add other mappings from your Brokers.jsx if needed
  "stake": "Stake", "superhero": "Superhero", "commsec": "CommSec",
  "nabtrade": "NAB Trade", "etoro": "eToro", "moomoo": "Moomoo",
};

const formatCurrency = (value, currency = 'USD') => {
  if (typeof value !== 'number' || isNaN(value)) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(0);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
};

const BrokerUpload = () => {
  const { brokerId: routeBrokerId } = useParams(); // Renamed to avoid conflict
  const navigate = useNavigate();
  const { user } = useAuth(); // Get current user

  // For Transaction Table
  const [transactionsForTable, setTransactionsForTable] = useState([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  
  const [notification, setNotification] = useState({ open: false, message: "", severity: "success" });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const brokerDisplayName = brokerNameMap[routeBrokerId] || routeBrokerId.charAt(0).toUpperCase() + routeBrokerId.slice(1);
  const [actualBrokerId, setActualBrokerId] = useState(null); // Store the UUID of the broker

  // --- State for Portfolio Chart specific to this broker ---
  const [allBrokerActivities, setAllBrokerActivities] = useState([]); // Raw activities for this broker
  const [brokerPortfolioChartData, setBrokerPortfolioChartData] = useState([]);
  const [brokerHoldingsSummary, setBrokerHoldingsSummary] = useState([]);
  const [currentBrokerPortfolioValue, setCurrentBrokerPortfolioValue] = useState(0);
  const [isLoadingBrokerChartData, setIsLoadingBrokerChartData] = useState(false);

  // Chart controls state
  const [timeRange, setTimeRange] = useState('all');
  const [graphType, setGraphType] = useState('stacked');
  // Markets for chart dropdown, derived from this broker's activities
  const [selectedMarketsForBrokerChart, setSelectedMarketsForBrokerChart] = useState(['ALL']); 

  const availableMarketsForBrokerChart = useMemo(() => {
    const markets = new Set(allBrokerActivities.map(tx => tx.securities?.exchange).filter(Boolean));
    return ['ALL', ...Array.from(markets)];
  }, [allBrokerActivities]);


  // --- SIMPLIFIED Portfolio Data Processing for THIS BROKER ---
  const processAndSetBrokerPortfolioData = useCallback((activitiesData) => {
    if (!activitiesData || activitiesData.length === 0) {
      setBrokerPortfolioChartData([]);
      setBrokerHoldingsSummary([]);
      setCurrentBrokerPortfolioValue(0);
      return;
    }

    const holdings = {}; 
    const chartPoints = [];
    const sortedActivities = [...activitiesData].sort((a, b) => new Date(a.date) - new Date(b.date));

    sortedActivities.forEach(tx => {
      const securityId = tx.securities?.symbol || `unknown-${tx.security_id}`;
      const market = tx.securities?.exchange || 'OTHER';
      const dateStr = new Date(tx.date).toISOString().split('T')[0];

      if (!holdings[securityId]) {
        holdings[securityId] = {
          symbol: tx.securities?.symbol, name: tx.securities?.name || securityId,
          market: market, quantity: 0, totalCost: 0, lastPrice: tx.price,
          currency: tx.currency, dividendsReceived: 0, realizedGainLoss: 0,
        };
      }
      const holding = holdings[securityId];
      holding.lastPrice = tx.price;

      if (tx.type.toLowerCase() === 'buy') {
        holding.quantity += tx.quantity;
        holding.totalCost += (tx.quantity * tx.price) + (tx.fees || 0);
      } else if (tx.type.toLowerCase() === 'sell') {
        if (holding.quantity > 0) {
            const avgCostPerShare = holding.totalCost / holding.quantity;
            const costOfSoldShares = avgCostPerShare * tx.quantity;
            const proceeds = (tx.quantity * tx.price) - (tx.fees || 0);
            holding.realizedGainLoss += proceeds - costOfSoldShares;
            holding.quantity -= tx.quantity;
            holding.totalCost -= costOfSoldShares;
            if (holding.quantity < 0.00001) holding.quantity = 0;
            if (holding.quantity === 0) holding.totalCost = 0;
        }
      } else if (tx.type.toLowerCase() === 'dividend') {
        holding.dividendsReceived += tx.total_amount;
      }

      let currentDayPortfolioValue = 0;
      const currentDayMarketValues = {};
      Object.values(holdings).forEach(h => {
        const marketValue = h.quantity * h.lastPrice; 
        currentDayPortfolioValue += marketValue;
        currentDayMarketValues[h.market] = (currentDayMarketValues[h.market] || 0) + marketValue;
      });

      const point = { date: dateStr, totalValue: currentDayPortfolioValue };
      for (const mkt in currentDayMarketValues) {
        point[mkt] = currentDayMarketValues[mkt];
      }
      const existingPointIndex = chartPoints.findIndex(p => p.date === dateStr);
      if (existingPointIndex > -1) {
        chartPoints[existingPointIndex] = point;
      } else {
        chartPoints.push(point);
      }
    });
    
    let filteredChartPoints = chartPoints;
    if (selectedMarketsForBrokerChart.length > 0 && !selectedMarketsForBrokerChart.includes('ALL')) {
        filteredChartPoints = chartPoints.map(point => {
            const newPoint = { date: point.date, totalValue: 0 };
            let newTotalValue = 0;
            selectedMarketsForBrokerChart.forEach(market => {
                if (point[market]) {
                    newPoint[market] = point[market];
                    newTotalValue += point[market];
                }
            });
            newPoint.totalValue = newTotalValue;
            return newPoint;
        }).filter(p => p.totalValue > 0 || Object.keys(p).length > 2); // Keep if has market data
    }

    setBrokerPortfolioChartData(filteredChartPoints);

    const summary = Object.values(holdings)
      .filter(h => h.quantity > 0.00001)
      .map(h => {
        const currentValue = h.quantity * h.lastPrice;
        const unrealizedGainLoss = currentValue - h.totalCost;
        const totalReturn = unrealizedGainLoss + h.realizedGainLoss + h.dividendsReceived;
        return {
          symbol: h.symbol, name: h.name, price: h.lastPrice, quantity: h.quantity,
          value: currentValue, capitalGains: unrealizedGainLoss, dividends: h.dividendsReceived,
          currency: h.currency, return: totalReturn,
        };
      });
    setBrokerHoldingsSummary(summary);
    setCurrentBrokerPortfolioValue(summary.reduce((acc, h) => acc + h.value, 0));
  }, [selectedMarketsForBrokerChart]);


  const loadBrokerData = useCallback(async () => {
    if (!user || !brokerDisplayName) return;
    setIsLoadingTransactions(true);
    setIsLoadingBrokerChartData(true);
    try {
      const { data: brokerDetails, error: brokerDetailsError } = await supabase
        .from("brokers")
        .select("id")
        .eq("user_id", user.id) // Ensure broker belongs to user
        .ilike("name", `%${brokerDisplayName}%`) // Use display name for lookup
        .single();
      
      if (brokerDetailsError || !brokerDetails) {
        console.warn(`Broker "${brokerDisplayName}" not found in DB or error:`, brokerDetailsError);
        setAllBrokerActivities([]);
        setTransactionsForTable([]);
        processAndSetBrokerPortfolioData([]);
        setActualBrokerId(null);
        return;
      }
      setActualBrokerId(brokerDetails.id);

      const { data: activitiesData, error: activitiesError } = await supabase
        .from("activities")
        .select(`
          id, type, date, quantity, price, total_amount, fees, currency, notes,
          securities:security_id (symbol, name, exchange, currency)
        `)
        .eq("user_id", user.id)
        .eq("broker_id", brokerDetails.id)
        .order("date", { ascending: true });

      if (activitiesError) throw activitiesError;
      
      const rawActivities = activitiesData || [];
      setAllBrokerActivities(rawActivities);

      const formattedForTable = rawActivities.map(tx => ({
        id: tx.id, type: tx.type, date: new Date(tx.date).toLocaleDateString(),
        market: tx.securities?.exchange || "N/A", code: tx.securities?.symbol || "N/A",
        securityName: tx.securities?.name || tx.securities?.symbol || "N/A",
        quantity: tx.quantity, price: tx.price, brokerage: tx.fees,
        currency: tx.currency, totalAmount: tx.total_amount,
        broker: brokerDisplayName, notes: tx.notes,
      })).sort((a, b) => new Date(b.date) - new Date(a.date));
      setTransactionsForTable(formattedForTable);
      
      processAndSetBrokerPortfolioData(rawActivities);

    } catch (error) {
      console.error("Error loading broker data:", error);
      setNotification({ open: true, message: `Error loading data for ${brokerDisplayName}: ${error.message}`, severity: "error" });
    } finally {
      setIsLoadingTransactions(false);
      setIsLoadingBrokerChartData(false);
    }
  }, [user, brokerDisplayName, processAndSetBrokerPortfolioData]);

  useEffect(() => {
    loadBrokerData();
  }, [loadBrokerData]); // brokerDisplayName (from route) will trigger re-fetch via loadBrokerData dependency

const handleUploadComplete = async (importedCount) => {
  setNotification({
    open: true,
    message: `Successfully imported ${importedCount} transactions for ${brokerDisplayName}`,
    severity: "success",
  });

  await loadBrokerData(); // Refresh data and calculate new portfolio value

  // Insert snapshot after recalculating
  const { error: snapshotError } = await supabase.from("portfolio_snapshots").insert([
    {
      user_id: user.id,
      date: new Date().toISOString().split("T")[0], // today's date
      total_value: currentBrokerPortfolioValue,
      broker: brokerDisplayName,
    },
  ]);

  if (snapshotError) {
    console.error("Error inserting snapshot:", snapshotError);
    setNotification({
      open: true,
      message: `Failed to save snapshot: ${snapshotError.message}`,
      severity: "error",
    });
  }
};


  const handleDeleteTransaction = async (transactionId) => {
    try {
      const { error } = await supabase.from("activities").delete().eq("id", transactionId);
      if (error) throw error;
      setNotification({ open: true, message: "Transaction deleted", severity: "success" });
      loadBrokerData();
    } catch (error) {
      console.error("Error deleting transaction:", error);
      setNotification({ open: true, message: `Error: ${error.message}`, severity: "error" });
    }
  };

  const handleOpenDeleteDialog = () => setDeleteDialogOpen(true);
  const handleCloseDeleteDialog = () => setDeleteDialogOpen(false);

  const handleDeleteAllBrokerData = async () => {
    if (!actualBrokerId) {
        setNotification({ open: true, message: `Broker ID not found for ${brokerDisplayName}. Cannot delete.`, severity: "error" });
        return;
    }
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("activities").delete().eq("broker_id", actualBrokerId);
      if (error) throw error;
      setNotification({ open: true, message: `All transactions from ${brokerDisplayName} deleted`, severity: "success" });
      loadBrokerData(); // Will re-fetch and show empty state
    } catch (error) {
      console.error("Error deleting broker data:", error);
      setNotification({ open: true, message: `Error: ${error.message}`, severity: "error" });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleCloseNotification = () => setNotification({ ...notification, open: false });

  const chartDistinctMarketsForBroker = useMemo(() => {
    if (brokerPortfolioChartData.length === 0) return [];
    const markets = new Set();
    brokerPortfolioChartData.forEach(d => {
      Object.keys(d).forEach(key => {
        if (key !== 'date' && key !== 'totalValue') markets.add(key);
      });
    });
    return Array.from(markets).sort();
  }, [brokerPortfolioChartData]);

  const marketColors = { ASX: '#ffbb28', NASDAQ: '#00C49F', NYSE: '#0088FE', LSE: '#FF8042', TSE: '#8884d8', OTHER: '#cccccc' };
  const defaultColor = '#808080';


  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 8 }}>
      <Breadcrumbs sx={{ mb: 3 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
          <HomeOutlined sx={{ mr: 0.5 }} fontSize="small" /> Home
        </Link>
        <Link to="/brokers" style={{ color: 'inherit', textDecoration: 'none' }}>Brokers</Link>
        <Typography color="text.primary">{brokerDisplayName}</Typography>
      </Breadcrumbs>

      <Box sx={{ display: "flex", alignItems: "center", mb: 2, flexWrap: 'wrap' }}>
        <Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate("/brokers")} sx={{ mr: 2, mb: {xs: 2, md: 0} }}>
          Back to Brokers
        </Button>
        <Typography variant="h4" component="h1" fontWeight="bold">
          {brokerDisplayName}
        </Typography>
      </Box>

      {/* --- Portfolio Value and Chart Section for THIS BROKER --- */}
      <StyledPaper sx={{mb:4}}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" component="h2" fontWeight="medium">
            Portfolio Overview ({brokerDisplayName})
          </Typography>
          <Box sx={{textAlign: 'right'}}>
            <Typography variant="body2" color="text.secondary">Current value with {brokerDisplayName}</Typography>
            <Typography variant="h5" component="p" fontWeight="bold">
              {isLoadingBrokerChartData ? <CircularProgress size={24} /> : formatCurrency(currentBrokerPortfolioValue, 'AUD')}
            </Typography>
          </Box>
        </Box>
        <Grid container spacing={2} sx={{ mb: 2 }} alignItems="center">
          <Grid item xs={12} sm={6} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Time Range</InputLabel>
              <Select value={timeRange} label="Time Range" onChange={(e) => setTimeRange(e.target.value)} disabled>
                <MenuItem value="all">All time</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Graph Type</InputLabel>
              <Select value={graphType} label="Graph Type" onChange={(e) => setGraphType(e.target.value)}>
                <MenuItem value="stacked">Value - Stacked by Market</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={12} md={4}>
             <FormControl fullWidth size="small">
              <InputLabel>Filter Markets</InputLabel>
              <Select multiple value={selectedMarketsForBrokerChart}
                onChange={(e) => {
                    const value = e.target.value;
                    if (value.includes('ALL') && value.length > 1) setSelectedMarketsForBrokerChart(['ALL']);
                    else if (value.length === 0) setSelectedMarketsForBrokerChart(['ALL']);
                    else setSelectedMarketsForBrokerChart(typeof value === 'string' ? value.split(',') : value);
                }}
                label="Filter Markets" renderValue={(selected) => selected.join(', ')}
              >
                {availableMarketsForBrokerChart.map((market) => (
                  <MenuItem key={market} value={market}>{market}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {isLoadingBrokerChartData ? (
          <Box sx={{ height: 350, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><CircularProgress /></Box>
        ) : brokerPortfolioChartData.length > 0 ? (
          <Box sx={{ height: 350, width: '100%' }}>
            <ResponsiveContainer>
              <AreaChart data={brokerPortfolioChartData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(tick) => new Date(tick + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })} />
                <YAxis tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toFixed(0) } />
                <Tooltip formatter={(value, name) => [formatCurrency(value, 'AUD'), name]}/>
                <Legend />
                {chartDistinctMarketsForBroker.map((marketKey) => (
                  <Area key={marketKey} type="monotone" dataKey={marketKey} stackId="1"
                    stroke={marketColors[marketKey] || defaultColor} fill={marketColors[marketKey] || defaultColor}
                    fillOpacity={0.7} name={marketKey} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Typography sx={{ textAlign: 'center', height: 350, py:4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            No transaction data with {brokerDisplayName} to display chart.
          </Typography>
        )}
        
        <TableContainer sx={{ mt: 4 }}>
            <Table size="small">
                <TableHead><TableRow sx={{ '& th': { fontWeight: 'bold' }}}>
                    <TableCell>Security</TableCell>
                    <TableCell align="right">Last Price</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Value</TableCell>
                    <TableCell align="right">Unrealized P/L</TableCell>
                    <TableCell align="right">Dividends</TableCell>
                    <TableCell align="right">Total Return</TableCell>
                </TableRow></TableHead>
                <TableBody>
                    {brokerHoldingsSummary.map((holding) => (
                        <TableRow key={holding.symbol} hover>
                            <TableCell><MuiLink component="span" sx={{fontWeight:'medium'}}>{holding.symbol}</MuiLink>
                                <Typography variant="caption" display="block" color="text.secondary">{holding.name}</Typography></TableCell>
                            <TableCell align="right">{formatCurrency(holding.price, holding.currency)}</TableCell>
                            <TableCell align="right">{holding.quantity % 1 === 0 ? holding.quantity : holding.quantity.toFixed(4)}</TableCell>
                            <TableCell align="right">{formatCurrency(holding.value, holding.currency)}</TableCell>
                            <TableCell align="right" sx={{color: holding.capitalGains >= 0 ? 'success.main' : 'error.main'}}>
                                {formatCurrency(holding.capitalGains, holding.currency)}</TableCell>
                            <TableCell align="right">{formatCurrency(holding.dividends, holding.currency)}</TableCell>
                            <TableCell align="right" sx={{color: holding.return >= 0 ? 'success.main' : 'error.main'}}>
                                {formatCurrency(holding.return, holding.currency)}</TableCell>
                        </TableRow>
                    ))}
                    {brokerHoldingsSummary.length > 0 && (
                        <TableRow sx={{ '& td, & th': { borderTop: '2px solid rgba(224, 224, 224, 1)', fontWeight: 'bold' } }}>
                            <TableCell>Total ({brokerDisplayName})</TableCell>
                            <TableCell colSpan={2}></TableCell>{/* Empty cells for alignment */}
                            <TableCell align="right">{formatCurrency(currentBrokerPortfolioValue, 'AUD')}</TableCell>
                            <TableCell align="right" sx={{color: brokerHoldingsSummary.reduce((acc, h) => acc + h.capitalGains, 0) >= 0 ? 'success.main' : 'error.main'}}>
                                {formatCurrency(brokerHoldingsSummary.reduce((acc, h) => acc + h.capitalGains, 0), 'AUD')}</TableCell>
                            <TableCell align="right">{formatCurrency(brokerHoldingsSummary.reduce((acc, h) => acc + h.dividends, 0), 'AUD')}</TableCell>
                            <TableCell align="right" sx={{color: brokerHoldingsSummary.reduce((acc, h) => acc + h.return, 0) >= 0 ? 'success.main' : 'error.main'}}>
                                {formatCurrency(brokerHoldingsSummary.reduce((acc, h) => acc + h.return, 0), 'AUD')}</TableCell>
                        </TableRow>
                    )}
                     {brokerHoldingsSummary.length === 0 && !isLoadingBrokerChartData && (
                        <TableRow><TableCell colSpan={7} align="center">No current holdings with {brokerDisplayName} to display.</TableCell></TableRow>
                     )}
                </TableBody>
            </Table>
        </TableContainer>
      </StyledPaper>

      <Divider sx={{ my: 4 }} />

      {/* --- Existing CSV Uploader and Transaction Table Section --- */}
      <Typography variant="h5" component="h2" gutterBottom sx={{mt:3}}>
        Import & Manage Transactions for {brokerDisplayName}
      </Typography>
      <StyledPaper sx={{ mb: 4 }}>
        <BrokerCSVUploader 
          onUploadComplete={(data) => handleUploadComplete(data.importedCount || data.length)} // Ensure correct prop for count
          brokerName={brokerDisplayName} 
        />
      </StyledPaper>

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" component="h3">
          Transaction History ({brokerDisplayName})
        </Typography>
        <Box>
            <Button variant="text" startIcon={<Refresh />} onClick={loadBrokerData} sx={{ mr: 1 }} disabled={isLoadingTransactions || isLoadingBrokerChartData}>
                Refresh Data
            </Button>
            {transactionsForTable.length > 0 && (
            <Button variant="text" color="error" startIcon={<DeleteOutline />} onClick={handleOpenDeleteDialog} disabled={isDeleting}>
                Delete All {brokerDisplayName} Data
            </Button>
            )}
        </Box>
      </Box>

      <StyledPaper>
        {isLoadingTransactions ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
        ) : transactionsForTable.length > 0 ? (
          <TransactionTable transactions={transactionsForTable} onDelete={handleDeleteTransaction} />
        ) : (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="body1" color="text.secondary">No transactions found for {brokerDisplayName}.</Typography>
          </Box>
        )}
      </StyledPaper>

      {/* ... (Dialogs and Snackbar - same as before, just ensure titles are dynamic with brokerDisplayName) ... */}
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
        <DialogTitle>Delete All {brokerDisplayName} Data</DialogTitle>
        <DialogContent><DialogContentText>
            Are you sure you want to delete all transactions from {brokerDisplayName}? This action cannot be undone.
        </DialogContentText></DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} color="primary" disabled={isDeleting}>Cancel</Button>
          <Button onClick={handleDeleteAllBrokerData} color="error" variant="contained" disabled={isDeleting}>
            {isDeleting ? <CircularProgress size={24} sx={{color: 'white'}} /> : "Delete All"}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={notification.open} autoHideDuration={6000} onClose={handleCloseNotification}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert onClose={handleCloseNotification} severity={notification.severity} variant="filled" sx={{ width: "100%" }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default BrokerUpload;