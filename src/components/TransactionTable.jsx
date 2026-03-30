import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Box,
  Tooltip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
  TextField,
  MenuItem,
} from "@mui/material";
import {
  Edit,
  Delete,
  Info,
  TrendingUp,
  TrendingDown,
  Payments,
} from "@mui/icons-material";

const TransactionTable = ({ transactions, onDelete }) => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [filterType, setFilterType] = useState("All");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleFilterChange = (event) => {
    setFilterType(event.target.value);
    setPage(0);
  };

  const handleDeleteClick = (transaction) => {
    setTransactionToDelete(transaction);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (transactionToDelete) {
      onDelete(transactionToDelete.id);
    }
    setDeleteDialogOpen(false);
    setTransactionToDelete(null);
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setTransactionToDelete(null);
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case "Buy":
        return <TrendingUp color="success" />;
      case "Sell":
        return <TrendingDown color="error" />;
      case "Dividend":
        return <Payments color="primary" />;
      default:
        return <Info />;
    }
  };

  const getTypeChip = (type) => {
    let color;
    switch (type) {
      case "Buy":
        color = "success";
        break;
      case "Sell":
        color = "error";
        break;
      case "Dividend":
        color = "primary";
        break;
      default:
        color = "default";
    }
    return (
      <Chip
        icon={getTypeIcon(type)}
        label={type}
        size="small"
        color={color}
        variant="outlined"
      />
    );
  };

  // Filter transactions by type if filter is active
  const filteredTransactions = transactions.filter((transaction) => {
    if (filterType === "All") return true;
    return transaction.type === filterType;
  });

  // Calculate visible rows
  const visibleRows = filteredTransactions.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <Box>
      <Box sx={{ mb: 2, display: "flex", justifyContent: "flex-end" }}>
        <TextField
          select
          label="Filter by Type"
          value={filterType}
          onChange={handleFilterChange}
          size="small"
          sx={{ width: 200 }}
        >
          <MenuItem value="All">All Transactions</MenuItem>
          <MenuItem value="Buy">Buy</MenuItem>
          <MenuItem value="Sell">Sell</MenuItem>
          <MenuItem value="Dividend">Dividend</MenuItem>
        </TextField>
      </Box>

      <TableContainer>
        <Table sx={{ minWidth: 650 }} size="medium">
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Market</TableCell>
              <TableCell>Code</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell align="right">Brokerage</TableCell>
              <TableCell>Currency</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>{getTypeChip(row.type)}</TableCell>
                <TableCell>{row.date}</TableCell>
                <TableCell>{row.market}</TableCell>
                <TableCell>
                  <Tooltip title={row.securityName}>
                    <span>{row.code}</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="right">
                  {row.quantity?.toLocaleString() || "-"}
                </TableCell>
                <TableCell align="right">
                  {row.price?.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }) || "-"}
                </TableCell>
                <TableCell align="right">
                  {row.brokerage
                    ? row.brokerage.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : "-"}
                </TableCell>
                <TableCell>{row.currency}</TableCell>
                <TableCell align="right">
                  {row.totalAmount?.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }) || "-"}
                </TableCell>
                <TableCell>
                  <Box>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteClick(row)}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  No transactions found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={filteredTransactions.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          Confirm Delete Transaction
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to delete this transaction?
            {transactionToDelete && (
              <Box component="span" sx={{ display: "block", mt: 2 }}>
                {transactionToDelete.type} {transactionToDelete.quantity}{" "}
                {transactionToDelete.code} at {transactionToDelete.price}{" "}
                {transactionToDelete.currency} on {transactionToDelete.date}
              </Box>
            )}
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TransactionTable; 