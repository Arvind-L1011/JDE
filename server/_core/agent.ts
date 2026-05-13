import { invokeLLM, InvokeParams, InvokeResult, ToolCall, Message, Role, Tool } from './llm';
import * as jdeDb from '../jdeDb';
import { z } from 'zod';

export type { Message, Role };
// Example tool definition for JDE SQL querying
const JDE_TOOLS: Tool[] = [{
  type: 'function',
  function: {
    name: 'jde_sql_query',
    description: 'Execute SELECT query on JDE MSSQL (JDE_AI).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Safe SELECT SQL (TOP 20 max)' }
      },
      required: ['query']
    }
  }
}];

const SCHEMA_KNOWLEDGE = `JDE Visionary SQL Agent. SAFE SELECT queries ONLY.

**Tables:**
F0101: AN8(ID), ABALPH(Name), ABAT1(Type)
F4101: IMITM(Item), IMDSC1(Desc), IMSRP1(Category)
F4211: SDDOCO(SO#), SDITM(Item), SDUORG(Qty), SDPRIO(Priority)
F4301: PHDOCO(PO#), PHTRDJ(Date)
F4311: PDDOCO(PO#), PDAN8(Supplier), PDUORG(Qty)

**Rules:** SELECT TOP 20, RTRIM(), ISNULL(), JULIAN dates.

**Sample:** SELECT TOP 10 RTRIM(PHDOCO), F0101.ABALPH FROM F4301 JOIN F4311...`;

export async function agentQueryJDE(question: string): Promise<any> {
  const messages: Message[] = [
    {
      role: 'system' as Role,
      content: SCHEMA_KNOWLEDGE
    },
    {
      role: 'user' as Role,
      content: question
    }
  ];

  const llmResult = await invokeLLM({ 
    messages,
    tools: JDE_TOOLS,
    tool_choice: 'auto'
  });

  // Simple response for now
  const response = llmResult.choices[0]?.message?.content || 'No response';

  return {
    question,
    sql: 'SELECT TOP 5 * FROM F4211 ORDER BY SDDOCO DESC', // Demo
    data: [], // Would be from jdeDb.executeQuery(sql)
    intent: 'demo'
  };
}

