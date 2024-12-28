import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { DatePickerWithRange } from "@/components/DateRangePicker";
import DailyTrendChart from "./DailyTrendChart";
import { ScrollArea } from "@/components/ui/scroll-area";

const TimeAnalysis = () => {
  // Mock data - replace with actual GitHub API calls
  const data = Array.from({ length: 50 }, (_, i) => ({
    name: `repo-${i + 1}/${i % 2 === 0 ? 'ci' : 'deploy'}`,
    minutes: Math.floor(Math.random() * 200) + 20,
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-4">
        <DatePickerWithRange />
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Workflow Time Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] w-full">
            <div className="min-w-[800px]">
              <ResponsiveContainer width="100%" height={1600}>
                <BarChart 
                  data={data} 
                  layout="vertical" 
                  margin={{ top: 20, right: 30, left: 150, bottom: 5 }}
                >
                  <XAxis type="number" label={{ value: 'Minutes', position: 'bottom' }} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={140}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Bar dataKey="minutes" fill="#2ea44f" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <DailyTrendChart />
    </div>
  );
};

export default TimeAnalysis;