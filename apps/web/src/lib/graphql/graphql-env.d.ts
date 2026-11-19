/* eslint-disable */
/* prettier-ignore */

export type introspection_types = {
    'Boolean': unknown;
    'CardioLog': unknown;
    'CardioTarget': unknown;
    'Client': { kind: 'OBJECT'; name: 'Client'; fields: { 'cardioTarget': { name: 'cardioTarget'; type: { kind: 'SCALAR'; name: 'CardioTarget'; ofType: null; } }; 'createdAt': { name: 'createdAt'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'DateTime'; ofType: null; }; } }; 'id': { name: 'id'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null; }; } }; 'name': { name: 'name'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'sessionsPerWeek': { name: 'sessionsPerWeek'; type: { kind: 'SCALAR'; name: 'Int'; ofType: null; } }; 'status': { name: 'status'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'ENUM'; name: 'ClientStatus'; ofType: null; }; } }; }; };
    'ClientOverview': { kind: 'OBJECT'; name: 'ClientOverview'; fields: { 'client': { name: 'client'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Client'; ofType: null; }; } }; 'currentProgram': { name: 'currentProgram'; type: { kind: 'OBJECT'; name: 'Program'; ofType: null; } }; 'logs': { name: 'logs'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'LIST'; name: never; ofType: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'SessionLog'; ofType: null; }; }; }; } }; 'portalLink': { name: 'portalLink'; type: { kind: 'SCALAR'; name: 'String'; ofType: null; } }; }; };
    'ClientStatus': { name: 'ClientStatus'; enumValues: 'active' | 'paused' | 'archived'; };
    'DateTime': unknown;
    'Float': unknown;
    'ID': unknown;
    'Int': unknown;
    'Program': { kind: 'OBJECT'; name: 'Program'; fields: { 'activatedAt': { name: 'activatedAt'; type: { kind: 'SCALAR'; name: 'DateTime'; ofType: null; } }; 'clientId': { name: 'clientId'; type: { kind: 'SCALAR'; name: 'ID'; ofType: null; } }; 'createdAt': { name: 'createdAt'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'DateTime'; ofType: null; }; } }; 'id': { name: 'id'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null; }; } }; 'name': { name: 'name'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'startsOn': { name: 'startsOn'; type: { kind: 'SCALAR'; name: 'String'; ofType: null; } }; 'status': { name: 'status'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'ENUM'; name: 'ProgramStatus'; ofType: null; }; } }; 'weeks': { name: 'weeks'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ProgramWeeks'; ofType: null; }; } }; }; };
    'ProgramStatus': { name: 'ProgramStatus'; enumValues: 'draft' | 'active' | 'archived'; };
    'ProgramWeeks': unknown;
    'Query': { kind: 'OBJECT'; name: 'Query'; fields: { 'dashboard': { name: 'dashboard'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'LIST'; name: never; ofType: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'ClientOverview'; ofType: null; }; }; }; } }; }; };
    'SessionKind': { name: 'SessionKind'; enumValues: 'exercises' | 'cardio'; };
    'SessionLog': { kind: 'OBJECT'; name: 'SessionLog'; fields: { 'cardio': { name: 'cardio'; type: { kind: 'SCALAR'; name: 'CardioLog'; ofType: null; } }; 'date': { name: 'date'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'id': { name: 'id'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null; }; } }; 'kind': { name: 'kind'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'ENUM'; name: 'SessionKind'; ofType: null; }; } }; 'programId': { name: 'programId'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null; }; } }; 'programSessionId': { name: 'programSessionId'; type: { kind: 'SCALAR'; name: 'ID'; ofType: null; } }; 'sets': { name: 'sets'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'LIST'; name: never; ofType: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'SetLog'; ofType: null; }; }; }; } }; }; };
    'SetLog': { kind: 'OBJECT'; name: 'SetLog'; fields: { 'exerciseId': { name: 'exerciseId'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null; }; } }; 'reps': { name: 'reps'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null; }; } }; 'type': { name: 'type'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'ENUM'; name: 'SetType'; ofType: null; }; } }; 'weightKg': { name: 'weightKg'; type: { kind: 'SCALAR'; name: 'Float'; ofType: null; } }; }; };
    'SetType': { name: 'SetType'; enumValues: 'working' | 'backoff'; };
    'String': unknown;
};

/** An IntrospectionQuery representation of your schema.
 *
 * @remarks
 * This is an introspection of your schema saved as a file by GraphQLSP.
 * It will automatically be used by `gql.tada` to infer the types of your GraphQL documents.
 * If you need to reuse this data or update your `scalars`, update `tadaOutputLocation` to
 * instead save to a .ts instead of a .d.ts file.
 */
export type introspection = {
  name: never;
  query: 'Query';
  mutation: never;
  subscription: never;
  types: introspection_types;
};

import * as gqlTada from 'gql.tada';

declare module 'gql.tada' {
  interface setupSchema {
    introspection: introspection
  }
}