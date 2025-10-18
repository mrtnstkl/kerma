.PHONY: docker-build docker-up run build clean make-submission check-submission remove-submission remove-test

run:
	npm run start

build:
	npm i
	tsc

clean: remove-submission remove-test
	rm -rf node_modules
	# add further actions if needed

# add own tests if you want
run-tests:
	# Perform a simple connection check   
	nc -zv localhost 18018	



# don't touch these targets 
docker-build:
	docker-compose build

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

submission:
	mkdir -p _submission
	tar --exclude='./node_modules' --exclude='./_submission' --exclude='./_test' -czf _submission/submission.tgz .
	@echo Finished creating submission archive _submission/submission.tgz
	@echo Run make check-submission now to check if our automated grader will be able to connect to it

check-submission:
	rm -rf _test
	mkdir -p _test
	tar -xf _submission/submission.tgz -C _test

	$(MAKE) -C _test docker-build
	$(MAKE) -C _test docker-up
	
	@echo "Waiting 5 seconds for node to finish startup"
	sleep 5

	$(MAKE) run-tests
	
	$(MAKE) -C _test docker-down
	$(MAKE) remove-test
	@echo Test completed

remove-test:
	rm -rf _test

remove-submission:
	rm -rf _submission