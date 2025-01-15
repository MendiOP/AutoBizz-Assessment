import React, { useState } from "react";
import ReactDatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

function extractSpreadsheetIdFromUrl(url) {
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : url;
}

function App() {
  // User input for Spreadsheet link (or ID)
  const [spreadsheetLink, setSpreadsheetLink] = useState("");

  // Data states
  const [orders, setOrders] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [combinedData, setCombinedData] = useState([]);

  // Date states for filtering
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());

  // Loading and error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Best day calculation states
  const [bestDay, setBestDay] = useState(null);
  const [minimumRefund, setMinimumRefund] = useState(null);

  const apiKey = import.meta.env.VITE_api_key;

  async function fetchSheetData(spreadsheetId, sheetName) {
    const range = `${sheetName}!A1:Z10000`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) return [];

    const [headers, ...rows] = data.values;
    return rows.map((row) =>
      headers.reduce((obj, header, idx) => {
        obj[header] = row[idx] || null;
        return obj;
      }, {})
    );
  }

  function normalizeDateRange(start, end) {
    const normalizedStart = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      0,
      0,
      0
    );
    const normalizedEnd = new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate(),
      23,
      59,
      59
    );
    return { normalizedStart, normalizedEnd };
  }

  function filterOrdersByDate(ordersData, start, end) {
    const { normalizedStart, normalizedEnd } = normalizeDateRange(start, end);

    return ordersData.filter((order) => {
      const orderDateStr = order["Order Date"];
      if (!orderDateStr) return false;

      const parts = orderDateStr.split("-");
      const orderDate = new Date(parts.reverse().join("-"));
      return orderDate >= normalizedStart && orderDate <= normalizedEnd;
    });
  }

  function filterLineItemsByOrders(lineItemsData, filteredOrders) {
    const validOrderIds = new Set(filteredOrders.map((o) => o["Order ID"]));

    return lineItemsData.filter((li) => validOrderIds.has(li["Order ID"]));
  }

  function createLineItemMap(lineItems) {
    const lineItemMap = {};
    lineItems.forEach((item) => {
      const orderId = item["Order ID"];
      lineItemMap[orderId] = item;
    });
    return lineItemMap;
  }

  function combineOrdersWithLineItems(orders, filteredLineItems) {
    const lineItemMap = createLineItemMap(filteredLineItems);
    return orders.map((order) => {
      const orderId = order["Order ID"];
      const lineItem = lineItemMap[orderId];
      return {
        ...order,
        // If found, use lineItem's price; else "0"
        Price: lineItem ? lineItem["Price"] : "0",
      };
    });
  }

  function calculateDailyTotalPrice(combinedTable) {
    return combinedTable.reduce((acc, order) => {
      const date = order["Order Date"];
      const price = parseFloat(order["Price"]) || 0;
      acc[date] = (acc[date] || 0) + price;
      return acc;
    }, {});
  }

  function findBestDayToSave(dailyTotalPrice) {
    let bestDayLocal = null;
    let minRefundLocal = Infinity;

    const totalPrice = Object.values(dailyTotalPrice).reduce(
      (sum, val) => sum + val,
      0
    );

    for (const day in dailyTotalPrice) {
      const price = dailyTotalPrice[day];
      const otherDaysPrice = totalPrice - price;
      if (otherDaysPrice < minRefundLocal) {
        bestDayLocal = day;
        minRefundLocal = otherDaysPrice;
      }
    }
    return { bestDayLocal, minRefundLocal };
  }

  const handleFetchData = async () => {
    try {
      setError("");
      setLoading(true);

      // 1) Extract the ID from the link
      const spreadsheetId = extractSpreadsheetIdFromUrl(spreadsheetLink);
      if (!spreadsheetId) {
        throw new Error("Invalid Spreadsheet link or ID");
      }

      // 2) Fetch Orders and LineItems from the sheet
      const ordersData = await fetchSheetData(spreadsheetId, "Orders");
      const lineItemsData = await fetchSheetData(spreadsheetId, "LineItems");

      // 3) Filter Orders by the chosen date range
      const filteredOrders = filterOrdersByDate(ordersData, startDate, endDate);

      // 4) Filter line items by those filtered orders
      const filteredLineItems = filterLineItemsByOrders(
        lineItemsData,
        filteredOrders
      );

      // 5) Combine the filtered sets
      const combined = combineOrdersWithLineItems(
        filteredOrders,
        filteredLineItems
      );

      // 6) Update states
      setOrders(filteredOrders);
      setLineItems(filteredLineItems);
      setCombinedData(combined);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleFindBestDay = () => {
    if (combinedData.length === 0) return;
    const dailyTotalPrice = calculateDailyTotalPrice(combinedData);
    const { bestDayLocal, minRefundLocal } = findBestDayToSave(dailyTotalPrice);
    setBestDay(bestDayLocal);
    setMinimumRefund(minRefundLocal);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
      <h1 className="text-3xl font-bold mb-8">Assessment</h1>

      {/* Spreadsheet Link Input */}
      <div className="mb-8 flex flex-col items-center w-full max-w-md">
        <input
          type="text"
          placeholder="Paste spreadsheet link or ID here"
          className="border border-gray-300 rounded px-4 py-2 w-full mb-4"
          value={spreadsheetLink}
          onChange={(e) => setSpreadsheetLink(e.target.value)}
        />

        {/* Date Pickers for Start & End Date */}
        <div className="flex flex-col sm:flex-row sm:space-x-4 items-center mb-4">
          <div className="mb-2 sm:mb-0">
            <label className="block mb-1 font-semibold">Start Date</label>
            <ReactDatePicker
              selected={startDate}
              onChange={(date) => setStartDate(date)}
              dateFormat="dd-MM-yyyy"
              className="border border-gray-300 rounded px-2 py-1"
            />
          </div>
          <div className="mt-2 sm:mt-0">
            <label className="block mb-1 font-semibold">End Date</label>
            <ReactDatePicker
              selected={endDate}
              onChange={(date) => setEndDate(date)}
              dateFormat="dd-MM-yyyy"
              className="border border-gray-300 rounded px-2 py-1"
            />
          </div>
        </div>

        {/* Fetch Data Button */}
        <button
          onClick={handleFetchData}
          className="bg-teal-600 text-white text-lg font-semibold px-4 py-2 rounded hover:bg-teal-700"
          disabled={loading}
        >
          {loading ? "Loading..." : "Fetch Data"}
        </button>

        {error && (
          <p className="text-red-500 mt-2 font-semibold text-center">{error}</p>
        )}
      </div>

      {/* Show Tables only if data has been fetched and we have orders */}
      {!loading && orders.length > 0 && (
        <>
          <div className="w-full max-w-5xl flex flex-row space-x-8 justify-evenly items-stretch">
            {/* Orders Table */}
            <div className="flex-1 border border-gray-300 shadow bg-white p-4 rounded flex flex-col h-96">
              <h2 className="text-xl font-semibold mb-2">Orders Table</h2>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="p-2 border">Order ID</th>
                      <th className="p-2 border">Order Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order, idx) => (
                      <tr key={idx} className="even:bg-gray-100">
                        <td className="p-2 border">{order["Order ID"]}</td>
                        <td className="p-2 border">{order["Order Date"]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Combined Table */}
            <div className="flex-1 border border-gray-300 shadow bg-white p-4 rounded flex flex-col h-96">
              <h2 className="text-xl font-semibold mb-2">Combined Table</h2>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="p-2 border">Order ID</th>
                      <th className="p-2 border">Order Date</th>
                      <th className="p-2 border">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedData.map((item, idx) => (
                      <tr key={idx} className="even:bg-gray-100">
                        <td className="p-2 border">{item["Order ID"]}</td>
                        <td className="p-2 border">{item["Order Date"]}</td>
                        <td className="p-2 border">{item["Price"]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* LineItems Table */}
            <div className="flex-1 border border-gray-300 shadow bg-white p-4 rounded flex flex-col h-96">
              <h2 className="text-xl font-semibold mb-2">LineItems Table</h2>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="p-2 border">LineItem ID</th>
                      <th className="p-2 border">Order ID</th>
                      <th className="p-2 border">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, idx) => (
                      <tr key={idx} className="even:bg-gray-100">
                        <td className="p-2 border">{item["LineItem ID"]}</td>
                        <td className="p-2 border">{item["Order ID"]}</td>
                        <td className="p-2 border">{item["Price"]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Button to Find Best Day */}
          <div className="flex justify-center my-4">
            <button
              onClick={handleFindBestDay}
              className="bg-green-600 text-white text-lg font-semibold px-4 py-2 rounded hover:bg-green-700"
            >
              Find Best Day
            </button>
          </div>

          {/* Display Best Day */}
          {bestDay && (
            <div className="flex flex-col items-center mt-4">
              <h3 className="text-lg font-semibold">Best Day: {bestDay}</h3>
              <p className="text-gray-700">
                Minimum Refund: <strong>{minimumRefund}</strong>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
