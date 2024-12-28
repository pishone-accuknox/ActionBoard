import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WorkflowFailures from "./WorkflowFailures";
import TimeAnalysis from "./TimeAnalysis";

const Dashboard = () => {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8 text-github-dark dark:text-white">GitHub Actions Insights</h1>
      
      <Tabs defaultValue="time" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="time">Time Analysis</TabsTrigger>
          <TabsTrigger value="failures">Workflow Failures</TabsTrigger>
        </TabsList>
        
        <TabsContent value="time">
          <TimeAnalysis />
        </TabsContent>
        
        <TabsContent value="failures">
          <WorkflowFailures />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;