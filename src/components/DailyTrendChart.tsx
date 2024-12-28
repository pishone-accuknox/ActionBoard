import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const DailyTrendChart = () => {
  // Mock data - replace with actual data from your script
  const data = [
    { date: '2024-03-15', totalMinutes: 450 },
    { date: '2024-03-16', totalMinutes: 380 },
    { date: '2024-03-17', totalMinutes: 520 },
    { date: '2024-03-18', totalMinutes: 490 },
    { date: '2024-03-19', totalMinutes: 600 },
    { date: '2024-03-20', totalMinutes: 430 },
    { date: '2024-03-21', totalMinutes: 550 },
  ];

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Daily Runtime Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <XAxis 
                dataKey="date" 
                angle={-45} 
                textAnchor="end" 
                height={70}
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <YAxis label={{ value: 'Total Minutes', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                formatter={(value) => [`${value} minutes`, 'Total Runtime']}
              />
              <Line type="monotone" dataKey="totalMinutes" stroke="#2ea44f" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default DailyTrendChart;