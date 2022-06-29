import { Construct } from "constructs";
import { App, TerraformStack, TerraformOutput } from "cdktf";
import {
  AwsProvider,
  iam,
  lambdafunction,
  apigateway,
} from "@cdktf/provider-aws";

class MyStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new AwsProvider(this, "aws", {
      region: "us-west-1",
      accessKey: "fake_access_key",
      secretKey: "fake_secret_key",
      s3ForcePathStyle: true,
      skipCredentialsValidation: true,
      skipMetadataApiCheck: "true",
      skipRequestingAccountId: true,
      endpoints: [
        {
          ec2: "http://localhost:4566",
          lambda: "http://localhost:4566",
          iam: "http://localhost:4566",
          apigateway: "http://localhost:4566",
        },
      ],
    });

    const aws_iam_role = new iam.IamRole(this, "ia-role-for-lambda", {
      name: "iam_hello_role",
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Principal: {
              Service: "lambda.amazonaws.com",
            },
            Effect: "Allow",
            Sid: "",
          },
        ],
      }),
    });

    const lambda = new lambdafunction.LambdaFunction(this, "hello-cdktf", {
      filename: process.cwd() + "/lambda.zip",
      functionName: "hello-world",
      handler: "hello-world.handler",
      runtime: "nodejs14.x",
      role: aws_iam_role.arn,
    });

    const helloRestApi = new apigateway.ApiGatewayRestApi(this, "hello-api", {
      name: "HelloApi",
      description: "API to call Hello World",
    });

    new lambdafunction.LambdaPermission(this, "hello-permission", {
      statementId: "AllowAPIGatewayInvoke",
      action: "lambda:InvokeFunction",
      functionName: lambda.functionName,
      principal: "apigateway.amazonaws.com",
      sourceArn: helloRestApi.executionArn + "/*/*/*",
    });

    const proxy_method = new apigateway.ApiGatewayMethod(this, "proxy-root", {
      restApiId: helloRestApi.id,
      resourceId: helloRestApi.rootResourceId,
      httpMethod: "ANY",
      authorization: "NONE",
    });

    const helloResource = new apigateway.ApiGatewayResource(
      this,
      "hello-resource",
      {
        restApiId: helloRestApi.id,
        parentId: helloRestApi.rootResourceId,
        pathPart: "{proxy+}",
      }
    );

    const lambda_root = new apigateway.ApiGatewayIntegration(
      this,
      "lambda-root",
      {
        restApiId: helloRestApi.id,
        resourceId: proxy_method.resourceId,
        httpMethod: proxy_method.httpMethod,

        integrationHttpMethod: "POST",
        type: "AWS_PROXY",
        uri: lambda.invokeArn,
      }
    );

    const helloMethod = new apigateway.ApiGatewayMethod(this, "hello-method", {
      authorization: "NONE",
      httpMethod: "ANY",
      resourceId: helloResource.id,
      restApiId: helloRestApi.id,
    });

    const helloIntegration = new apigateway.ApiGatewayIntegration(
      this,
      "hello-integration",
      {
        restApiId: helloRestApi.id,
        resourceId: helloResource.id,
        httpMethod: helloMethod.httpMethod,
        integrationHttpMethod: "POST",
        type: "AWS_PROXY",
        uri: lambda.invokeArn,
      }
    );

    const deployment = new apigateway.ApiGatewayDeployment(
      this,
      "hello-deployment",
      {
        restApiId: helloRestApi.id,
        dependsOn: [helloIntegration, lambda_root],
        stageName: "test",
      }
    );

    new TerraformOutput(this, "deployment", {
      value: `${deployment.invokeUrl}`,
    });

    new TerraformOutput(this, "endpoint", {
      value: `http://localhost:4566/restapis/${helloRestApi.id}/test/_user_request_/`,
    });
  }
}

const app = new App();
new MyStack(app, "cdktf-tutorial");
app.synth();
