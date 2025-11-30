#!/usr/bin/env python
# Copyright (C) 2025 Thomas Ogrisegg
# License: GPLv3

colored = 1
from v import *
import os
import asyncio
import hashlib
import random
import json
from jcs import canonicalize
import sys

if (colored):
    from termcolor import colored, cprint

tcobj = {}
objects = {}

def print_output(msg):
    if (colored):
        print (colored(msg, 'green'))
    else:
        print (f"=> {msg}")

def print_input(msg):
    if (colored):
        print (colored(msg, 'yellow'))
    else:
        print (f"<= {msg}")

def print_info(msg):
    if (colored):
        cprint(msg, "white", attrs=["bold"])
    else:
        print (msg)

def print_error(msg):
    if (colored):
        cprint (msg, "red", attrs=["bold"])
    else:
        print (f"ERROR: {msg}")

async def write_msg(writer, msg):
    output = canonicalize(msg)
    print_output(output.decode('utf-8'))
    writer.write(output)
    writer.write(b'\n')
    await writer.drain()

async def process_cmd(xstr, writer):
    jsobj = json.loads(xstr)
    if (jsobj['type'] == 'getobject'):
        if (jsobj['objectid'] in objects):
            await write_msg(writer, objects[jsobj['objectid']])
        else:
            print (f"INFO: Could not find object {jsobj['objectid']}")
    if (jsobj['type'] == 'error'):
        return jsobj['name']
    return None

async def process_loop(reader, writer, _timeout=2.0):
    xstr = ""
    while (True):
        try:
            xstr = await asyncio.wait_for(reader.readline(), timeout=_timeout)
        except Exception as e:
            return None
        if (xstr == b""):
            return None
        print_input(xstr.decode('utf-8').strip())
        res = await process_cmd (xstr, writer)
        if (res is not None):
            return res

async def expect(reader, obj):
    try:
        xstr = await asyncio.wait_for(reader.readline(), timeout=3.0)
    except:
        print("Wait for failed")
        return False
    if (xstr == b""):
        print_error ("EOF received")
        return False
    print_input(xstr.decode('utf-8').strip())
    resobj = json.loads(xstr)
    if (canonicalize(obj) != canonicalize(resobj)):
        raise Exception (f"Received object does not match expected object {obj} vs {resobj}")
    return True

async def expect_error(reader, writer, err_type):
    error = await process_loop(reader, writer)
    if (error is None):
        error = await process_loop (reader, writer, 6.0)
        if (error is None):
            raise Exception (f"Expected {err_type} but no error received")
    if (error != err_type):
        raise Exception (f"Expected {err_type} but received {error['name']}")
    return True

async def run_test():
    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", "18018",
                                       limit=512*1024)
    except Exception as e:
        print_info(f"failed to connect to peer:  {str(e)}")
        return

    print_info (f"\nRunning test: {tcobj['description']}")
    await write_msg(writer, {'type':'hello','agent':'testagent/1.0','version':'0.10.5'})
    await write_msg(writer, {'type':'getpeers'})
    await process_loop(reader, writer)
    to_send = []
#    if (not 'send' in tcobj):
#        raise Exception ("No 'send' item in testcase. What is it good for?")
#    for txid,chk in tcobj['send']:
#        print (f"{txid} = {chk}")
    for o in tcobj['objects']:
        if (isinstance(o, list)):
            to_send.append(o)
            objects[gobjid(o[0])] = o[0]
#            print (f"{gobjid(o[0])} = {o[0]}")
        else:
            objects[gobjid(o)] = o
#            print (f"{gobjid(o)} = {o}")
    for i in to_send:
        obj = i[0]
        check = i[1]
        await write_msg(writer, obj)
        got_error = await process_loop(reader, writer)
        if (got_error is not None):
            if ('expected' in tcobj):
                if (got_error == tcobj['expected']):
                    pass
#                    print_info (f"PASS: Received expected error '{tcobj['expected']}'")
#                    return 0
                else:
                    raise Exception(f"Wrong error code received: {got_error} instead of {tcobj['expected']}")
            else:
                raise Exception (f"Unexpected error received: {got_error}")
        if (check):
            await write_msg(writer, {'type':'getobject', 'objectid':gobjid(obj)})
            if (await(expect(reader, obj)) is not True):
                raise Exception ("Did not receive expected object in time")
    if ('expected' in tcobj):
        if (got_error != None):
            if (got_error == tcobj['expected']):
                print_info (f"PASS: Received expected error '{got_error}'")
                writer.close()
                return 0
        if (await expect_error(reader, writer, tcobj['expected'])):
            print_info (f"PASS: Received expected error '{tcobj['expected']}'")
            writer.close()
            return 0
        writer.close()
        return 1
    else:
        writer.close()
        print_info ("PASS: no errors")

async def sleep(s):
    await asyncio.sleep(s)

passed = 0
failed = 0
failed_tests = []

if (len(sys.argv) == 1):
    print(f"usage: {sys.argv[0]} testcase.json [testcase2.json ...]")
    exit(1)

for arg in sys.argv[1:]:
    with open (arg) as f:
        tcobj = json.load(f)
        try:
            asyncio.run(run_test())
            passed += 1
        except Exception as e:
            print_error (f"TEST FAILED: {e}")
#            raise (e)
            failed += 1
            failed_tests.append(arg)
        asyncio.run(sleep(1))

print_info(f"SUMMARY: {passed} passed, {failed} failed")
if (len(failed_tests)>0):
    print_error("Failed tests:")
    for i in failed_tests:
        print_error(f"\t{i}")
