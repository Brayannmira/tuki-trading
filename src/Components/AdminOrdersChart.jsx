import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function AdminOrdersChart({ data }) {
  return (
    <div className="admin-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="adminOrdersGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f39c12" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#f39c12" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" stroke="#8b8b96" tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} stroke="#8b8b96" tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              borderColor: "#3f3f46",
              borderRadius: "8px",
              color: "#fff",
            }}
            formatter={(value) => [value, "Pedidos"]}
          />
          <Area
            type="monotone"
            dataKey="pedidos"
            stroke="#f39c12"
            strokeWidth={3}
            fill="url(#adminOrdersGradient)"
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AdminOrdersChart;
