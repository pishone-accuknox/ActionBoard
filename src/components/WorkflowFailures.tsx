import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExternalLink, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const WorkflowFailures = () => {
  const { data: failures, isLoading } = useQuery({
    queryKey: ['failedRuns'],
    queryFn: async () => {
      const response = await fetch('/ActionBoard/data/failed_runs.json');
      return response.json();
    },
  });

  if (isLoading) {
    return <Skeleton className="w-full h-[300px]" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Workflow Failures</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {failures.map((failure) => (
            <Alert key={failure.run_id} variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="font-semibold">
                {failure.repo} - {failure.workflow_name}
              </AlertTitle>
              <AlertDescription className="flex justify-between items-center">
                <span>Failed at {new Date(failure.created_at).toLocaleString()}</span>
                <a
                  href={failure.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-sm hover:underline"
                >
                  View Run <ExternalLink className="ml-1 h-4 w-4" />
                </a>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkflowFailures;