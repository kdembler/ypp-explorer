import { graphql } from "../gql";

export const getPaymentsQueryDocument = graphql(/* GraphQL */ `
  query GetChannelPayments($limit: Int!, $offset: Int!) {
    channelPaymentMadeEvents(
      limit: $limit
      offset: $offset
      orderBy: inBlock_ASC
    ) {
      id
      amount
      createdAt
      inBlock
      payeeChannel {
        id
        title
      }
      rationale
    }
  }
`);
