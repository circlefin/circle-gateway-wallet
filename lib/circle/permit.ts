/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  maxUint256,
  erc20Abi,
  parseErc6492Signature,
  getContract,
  type Address,
  type PublicClient,
  type Account,
  type Chain,
  type GetContractReturnType,
  type Transport,
} from "viem";

interface Eip2612PermitParams {
  token: GetContractReturnType<
    typeof eip2612Abi,
    PublicClient<Transport, Chain>
  >;
  chain: Chain;
  ownerAddress: Address;
  spenderAddress: Address;
  value: bigint;
}

export async function eip2612Permit({
  token,
  chain,
  ownerAddress,
  spenderAddress,
  value,
}: Eip2612PermitParams) {
  return {
    types: {
      // Required for compatibility with Circle PW Sign Typed Data API
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    } as const,
    primaryType: "Permit" as const,
    domain: {
      name: (await token.read.name()) as string,
      version: (await token.read
        .version()
        .catch(() => token.read.VERSION().catch(() => "1"))) as string,
      chainId: BigInt(chain.id),
      verifyingContract: token.address,
    },
    message: {
      owner: ownerAddress,
      spender: spenderAddress,
      value,
      nonce: (await token.read.nonces([ownerAddress])) as bigint,
      deadline: maxUint256,
    },
  };
}

export const eip2612Abi = [
  ...erc20Abi,
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
    name: "nonces",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    inputs: [],
    name: "version",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
];

interface SignPermitParams {
  tokenAddress: Address;
  client: PublicClient<Transport, Chain>;
  account: Account;
  spenderAddress: Address;
  permitAmount: bigint;
  // Optional walletClient for fallback typed data signing if account lacks signTypedData
  walletClient?: {
    // Return a hex signature
    signTypedData?: (args: {
      account: Account;
      domain: {
        name: string;
        version: string;
        chainId: bigint;
        verifyingContract: Address;
      };
      types: {
        EIP712Domain: ReadonlyArray<{ name: string; type: string }>;
        Permit: ReadonlyArray<{ name: string; type: string }>;
      };
      primaryType: "Permit";
      message: {
        owner: Address;
        spender: Address;
        value: bigint;
        nonce: bigint;
        deadline: bigint;
      };
    }) => Promise<`0x${string}`>;
  };
}

export async function signPermit({
  tokenAddress,
  client,
  account,
  spenderAddress,
  permitAmount,
  walletClient,
}: SignPermitParams) {
  const token = getContract({
    client,
    address: tokenAddress,
    abi: eip2612Abi,
  });
  const permitData = await eip2612Permit({
    token,
    chain: client.chain,
    ownerAddress: account.address,
    spenderAddress,
    value: permitAmount,
  });

  let wrappedPermitSignature: `0x${string}`;

  if (account.signTypedData) {
    wrappedPermitSignature = (await account.signTypedData(
      permitData
    )) as `0x${string}`;
  } else if (walletClient?.signTypedData) {
    // Fallback: use walletClient signer method (pass through original account for address context)
    wrappedPermitSignature = await walletClient.signTypedData({
      account,
      domain: permitData.domain,
      types: permitData.types,
      primaryType: permitData.primaryType,
      message: permitData.message,
    });
  } else {
    throw new Error(
      "Account does not support signing typed data and no walletClient.signTypedData fallback available."
    );
  }

  const { signature } = parseErc6492Signature(
    wrappedPermitSignature as `0x${string}`
  );
  return signature;
}
