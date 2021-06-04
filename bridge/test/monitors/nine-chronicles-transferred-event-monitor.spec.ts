import { IHeadlessGraphQLClient } from "../../src/interfaces/headless-graphql-client";
import { NineChroniclesTransferredEventMonitor } from "../../src/monitors/nine-chronicles-transferred-event-monitor";
import { NCGTransferredEvent } from "../../src/types/ncg-transferred-event";

jest.useFakeTimers();

describe("NineChroniclesTransferredEventMonitor", () => {
    const mockHeadlessGraphQLClient: jest.Mocked<IHeadlessGraphQLClient> = {
        getBlockIndex: jest.fn(h => Promise.resolve(parseInt(h))),
        getTipIndex: jest.fn(),
        getBlockHash: jest.fn(n => Promise.resolve(n.toString())),
        getNCGTransferredEvents: jest.fn().mockResolvedValue(Promise.resolve([])),
        getNextTxNonce: jest.fn(),
        transfer: jest.fn(),
    };

    describe("loop", () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        for (const confirmations of [0, 5]) {
            it(`should yield events with ${confirmations} confirmations`, async () => {
                const monitor = new NineChroniclesTransferredEventMonitor(null, confirmations, mockHeadlessGraphQLClient, "");

                mockHeadlessGraphQLClient.getTipIndex.mockResolvedValueOnce(0);
                console.log(mockHeadlessGraphQLClient.getBlockHash(0))

                const callback = jest.fn();
                monitor.subscribe(callback);
                monitor.run();

                for (let i = 1; i <= confirmations; ++i) {
                    mockHeadlessGraphQLClient.getTipIndex.mockResolvedValueOnce(i);
                }

                mockHeadlessGraphQLClient.getTipIndex.mockResolvedValueOnce(confirmations + 1);

                while (callback.mock.calls.length < 1) {
                    jest.runAllTimers();
                    await Promise.resolve();
                }

                expect(callback).toHaveBeenCalled();
                expect(callback.mock.calls.length).toEqual(1);
                expect(callback.mock.calls[0][0]).toEqual({
                    blockHash: expect.any(String),
                    events: expect.any(Array),
                });

                monitor.stop();
            });
        }

        for (const { latestTxId, txIds, expectedTxIds } of [
            { latestTxId: "TX-A", txIds: ["TX-A", "TX-B", "TX-C"], expectedTxIds: ["TX-B", "TX-C"] },
            { latestTxId: "TX-B", txIds: ["TX-A", "TX-B", "TX-C"], expectedTxIds: ["TX-C"] },
            { latestTxId: "TX-C", txIds: ["TX-A", "TX-B", "TX-C"], expectedTxIds: [] },
        ]) {
            it(`should skip until ${latestTxId} transaction in ${txIds}`, async () => {
                function makeNcgTransferredEvent(txId: string) {
                    return {
                        txId,
                        blockHash: "",
                        amount: "",
                        memo: "",
                        recipient: "",
                        sender: "",
                    };
                }

                mockHeadlessGraphQLClient.getNCGTransferredEvents.mockResolvedValueOnce(Promise.resolve(txIds.map(makeNcgTransferredEvent)));
                mockHeadlessGraphQLClient.getTipIndex.mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(2);

                const monitor = new NineChroniclesTransferredEventMonitor({ blockHash: "0", txId: latestTxId }, 0, mockHeadlessGraphQLClient, "");
                const callback = jest.fn();
                monitor.subscribe(callback);
                monitor.run();

                while (callback.mock.calls.length < 1) {
                    jest.runAllTimers();
                    await Promise.resolve();
                }

                expect(callback).toHaveBeenCalled();
                expect(callback.mock.calls.length).toEqual(1);
                expect(callback.mock.calls[0][0]).toEqual({
                    blockHash: expect.any(String),
                    events: expectedTxIds.map(x => {
                        return {
                            txId: x,
                            blockHash: expect.any(String),
                            memo: expect.any(String),
                            recipient: expect.any(String),
                            sender: expect.any(String),
                            amount: expect.any(String),
                        };
                    })
                });

                monitor.stop();
            });
        }
    });
});