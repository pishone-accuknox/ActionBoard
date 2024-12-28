import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const DailyTrendChart = () => {
  const { data: dailyTrend, isLoading } = useQuery({
    queryKey: ['dailyTrend'],
    queryFn: async () => {
      const response = await fetch('/data/daily_trend.json');
      return response.json();
    },
  });

  if (isLoading) {
    return <Skeleton className="w-full h-[300px]" />;
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Daily Runtime Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyTrend} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <XAxis 
                dataKey="date" 
                angle={-45} 
                textAnchor="end" 
                height={70}
              />
              <YAxis label={{ value: 'Total Minutes', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
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