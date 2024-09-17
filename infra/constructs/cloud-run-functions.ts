import { DataArchiveFile } from '@cdktf/provider-archive/lib/data-archive-file';
import {
    Cloudfunctions2Function,
    Cloudfunctions2FunctionEventTrigger,
  } from '@cdktf/provider-google/lib/cloudfunctions2-function';
import { StorageBucketObject } from '@cdktf/provider-google/lib/storage-bucket-object';
  import { Construct } from 'constructs';
import path = require('path');

  
  export type CloudRunFunctionsProps = {

    functionDir: string;
    functionName?: string;
    srcBucketName: string;
    location: string;
    projectId: string;
    environmentVariables?: {
        [key: string]: string;
    } 
    eventTrigger?: Cloudfunctions2FunctionEventTrigger;
  }
  
  export class CloudFunctions extends Construct {
    public readonly CloudRunFunction: Cloudfunctions2Function
  

    constructor(scope: Construct, id: string, props: CloudRunFunctionsProps) {
      super(scope, id);
  
      const { eventTrigger, functionName, functionDir, srcBucketName, projectId } = props;
  
      const code = new DataArchiveFile(this, 'archive_file', {
        type: 'zip',
        sourceDir: path.resolve(__dirname, '..', '..', 'functions', functionDir),
        outputPath: path.resolve(
          __dirname,
          '..',
          '..',
          'cdktf.out',
          'functions',
          'out',
          `${functionName}.zip`,
        ),
        excludes: ['.venv', '__pycache__'],
      });
  
      const srcObj = new StorageBucketObject(this, 'source_object', {
        name: code.outputMd5,
        bucket: srcBucketName,
        source: code.outputPath,
      });
  
      const environmentVariables: {
        [key: string]: string;
      } = {
        PROJECT_ID: projectId,
        ...props.environmentVariables,
      };

      this.CloudRunFunction = new Cloudfunctions2Function(this, 'Default', {
        name: functionName?? functionDir,
        location: props.location,
        buildConfig: {
          entryPoint: 'main',
          runtime: 'python312',
          source: {
            storageSource: {
              bucket: srcBucketName,
              object: srcObj.name,
            },
          },
        },
        serviceConfig: {
            availableCpu: '1',
            availableMemory: '1024M',            
            environmentVariables
        },
        eventTrigger
      });
  }
}