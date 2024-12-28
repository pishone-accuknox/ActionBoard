import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { DatePickerWithRange } from "@/components/DateRangePicker";
import DailyTrendChart from "./DailyTrendChart";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const TimeAnalysis = () => {
    const { data: workflowRuns, isLoading } = useQuery({
      queryKey: ['workflowRuns'],
      queryFn: async () => {
        const response = await fetch('/ActionBoard/data/workflow_runs.json');
        return response.json();
      },
    });

    if (isLoading) {
      return <Skeleton className="w-full h-[500px]" />;
    }

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
                  data={workflowRuns} 
                  layout="vertical" 
                  margin={{ top: 20, right: 30, left: 150, bottom: 5 }}
                >
                  <XAxis type="number" label={{ value: 'Minutes', position: 'bottom' }} />
                  <YAxis 
                    dataKey={(record) => `${record.repo}/${record.workflow_name}`} 
                    type="category" 
                    width={140}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    formatter={(value) => [`${value} minutes`, 'Total Runtime']}
                    labelFormatter={(label) => label}
                  />
                  <Bar dataKey="total_time_minutes" fill="#2ea44f" />
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